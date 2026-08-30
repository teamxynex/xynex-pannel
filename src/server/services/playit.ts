import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";

const execAsync = promisify(exec);

function pm2NameFor(serverName: string): string {
  return `playit_${serverName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

// Starts (or restarts) the Playit tunnel agent for a server as a PM2
// process. Used by the manual "Generate Tunnel" button and by
// auto-start-on-create for hosts with no configured Node IP.
export async function startPlayitTunnel(serverId: string, serverName: string): Promise<void> {
  const pm2Name = pm2NameFor(serverName);
  const serverDir = path.join(process.cwd(), ".data", "servers", serverId);
  const playitBin = path.join(serverDir, `playit_${serverName.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
  const secretPath = path.join(serverDir, "playit.toml");

  await fs.ensureDir(serverDir);
  const setupCmd = `mkdir -p "${serverDir}"; if [ ! -f "${playitBin}" ]; then wget -qO "${playitBin}" "https://github.com/playit-cloud/playit-agent/releases/download/v0.15.26/playit-linux-amd64" && chmod +x "${playitBin}"; fi`;

  await execAsync(
    `npx pm2 delete ${pm2Name} || true; npx pm2 flush ${pm2Name} || true; ${setupCmd} && npx pm2 start "${playitBin}" --name ${pm2Name} -- -s --secret_path "${secretPath}" && npx pm2 save`
  );
}

export interface PlayitStatus {
  status: "running" | "stopped";
  claimLink: string | null;
  tunnelAddress: string | null;
  logs: string;
}

// Reads the agent's recent PM2 logs to report status, the one-time claim
// link (shown before the agent is linked to a playit.gg account), and —
// once available — the public address players should connect to.
export async function getPlayitStatus(serverName: string): Promise<PlayitStatus> {
  const pm2Name = pm2NameFor(serverName);

  let running = false;
  try {
    const { stdout } = await execAsync("npx pm2 jlist");
    const jsonStart = stdout.indexOf("[");
    const jsonEnd = stdout.lastIndexOf("]");
    const jsonStr = jsonStart !== -1 && jsonEnd !== -1 ? stdout.substring(jsonStart, jsonEnd + 1) : stdout;
    const pm2List = JSON.parse(jsonStr);
    const proc = pm2List.find((p: any) => p.name === pm2Name);
    running = !!(proc && proc.pm2_env && proc.pm2_env.status === "online");
  } catch (e) {
    running = false;
  }

  if (!running) {
    return { status: "stopped", claimLink: null, tunnelAddress: null, logs: "" };
  }

  try {
    const { stdout } = await execAsync(`npx pm2 logs ${pm2Name} --nostream --lines 150`);
    const logs = (stdout || "").replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b./g, "");
    const claimMatches = logs.match(/https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+/g);
    // Once claimed and a tunnel is provisioned, playit's agent logs the
    // public hostname it's forwarding through — commonly ending in
    // .playit.gg or a custom domain, formatted as host:port or host=port.
    const addressMatches = logs.match(/\b[a-zA-Z0-9-]+\.(?:playit\.gg|joinmc\.link|gamehost\.my)(?::\d+)?\b/g);
    return {
      status: "running",
      claimLink: claimMatches ? claimMatches[claimMatches.length - 1] : null,
      tunnelAddress: addressMatches ? addressMatches[addressMatches.length - 1] : null,
      logs: logs.split("\n").slice(-50).join("\n"),
    };
  } catch (e) {
    return { status: "running", claimLink: null, tunnelAddress: null, logs: "" };
  }
}
