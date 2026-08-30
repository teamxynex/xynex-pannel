// Native process engine — runs servers as plain host processes instead of
// Docker/Podman containers. Used automatically by docker.ts whenever no
// container runtime is available (see `isNative` there). Every exported
// function here mirrors the matching docker.ts function 1:1 so servers.ts
// never has to know or care which engine is actually running a server.
//
// Two install/startup paths are supported:
//  1. Uploaded Pterodactyl eggs (egg.isPterodactyl) — the egg's own
//     installScript already knows how to download/build the server
//     software, and its `startup` string is just a shell command with
//     {{VARIABLE}} placeholders. Both translate directly to "run this
//     script/command on the host" with no container needed at all.
//  2. Built-in quick-create types (PAPER/PURPUR/VELOCITY/WATERFALL/VANILLA)
//     — these normally rely on the itzg Docker image to resolve a version
//     and download the right jar, so native mode does that itself via the
//     PaperMC/PurpurMC APIs and Mojang's version manifest.
import fs from "fs-extra";
import path from "path";
import net from "net";
import os from "os";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { io } from "../../../server.js";

export const NATIVE_PREFIX = "native-";

type NativeProc = {
  proc: ChildProcessWithoutNullStreams;
  startedAt: number;
};

const processes: Record<string, NativeProc> = {};
const lastCpuSample: Record<string, { time: number; cpuTicks: number }> = {};

function serverDirFor(serverId: string): string {
  return path.join(process.cwd(), ".data", "servers", serverId);
}

function logFileFor(serverId: string): string {
  const dir = path.join(process.cwd(), ".data", "native-logs");
  fs.ensureDirSync(dir);
  return path.join(dir, `${serverId}.log`);
}

function shellPath(): string {
  return fs.existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh";
}

function appendLog(serverId: string, text: string) {
  fs.appendFile(logFileFor(serverId), text).catch(() => {});
  io.to(`server_${serverId}`).emit("log", text);
}

// Renders a Pterodactyl-style STARTUP string, replacing every {{VAR}} with
// the matching value from the env map (same convention the itzg/Pterodactyl
// yolk images use).
function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, name) => {
    return vars[name] !== undefined ? String(vars[name]) : "";
  });
}

function buildEnvMap(serverData: any, egg?: any): Record<string, string> {
  const map: Record<string, string> = {
    STARTUP: egg?.startup || "",
    SERVER_MEMORY: String(Math.round((parseFloat(serverData.ram) || 1) * 1024)),
    SERVER_IP: "0.0.0.0",
    SERVER_PORT: String(serverData.port),
    P_SERVER_LOCATION: "local",
    P_SERVER_UUID: serverData.id,
    HOME: serverDirFor(serverData.id),
    PYTHONUNBUFFERED: "1",
    PIP_ROOT_USER_ACTION: "ignore",
  };
  if (egg?.portEnvVar && egg.portEnvVar !== "SERVER_PORT") map[egg.portEnvVar] = String(serverData.port);
  if (egg?.versionEnvVar && serverData.version) map[egg.versionEnvVar] = String(serverData.version);
  if (Array.isArray(egg?.variables)) {
    for (const v of egg.variables) {
      if (v && v.envVariable) map[v.envVariable] = String(v.defaultValue ?? "");
    }
  }
  if (egg?.envVars && typeof egg.envVars === "object") {
    for (const [k, v] of Object.entries(egg.envVars)) map[k] = String(v);
  }
  if (serverData.variables && typeof serverData.variables === "object") {
    for (const [k, v] of Object.entries(serverData.variables)) map[k] = String(v);
  }
  return map;
}

async function chmodServerDir(serverDir: string) {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    await promisify(exec)(`chmod -R 777 ${JSON.stringify(serverDir)}`);
  } catch (e) {
    console.warn("Could not chmod server directory:", e);
  }
}

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}) from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

// Downloads the actual server jar for built-in (non-egg) quick-create
// types, since without an egg's install script there's nothing else that
// would fetch it. Covers the common PaperMC-family projects plus vanilla;
// anything else is told to use an uploaded egg instead, which brings its
// own installer.
async function installBuiltinJar(serverData: any) {
  const serverDir = serverDirFor(serverData.id);
  await fs.ensureDir(serverDir);
  const type = (serverData.type || "PAPER").toUpperCase();
  const version = serverData.version && serverData.version !== "latest" ? serverData.version : undefined;
  const jarPath = path.join(serverDir, "server.jar");

  const paperFamily = async (project: string) => {
    const projRes = await fetch(`https://api.papermc.io/v2/projects/${project}`);
    if (!projRes.ok) throw new Error(`Could not reach PaperMC API for "${project}"`);
    const projData: any = await projRes.json();
    const ver = version && projData.versions?.includes(version)
      ? version
      : projData.versions[projData.versions.length - 1];
    const verRes = await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${ver}`);
    const verData: any = await verRes.json();
    const build = verData.builds[verData.builds.length - 1];
    const buildRes = await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${ver}/builds/${build}`);
    const buildData: any = await buildRes.json();
    const fileName = buildData.downloads.application.name;
    const url = `https://api.papermc.io/v2/projects/${project}/versions/${ver}/builds/${build}/downloads/${fileName}`;
    await downloadFile(url, jarPath);
  };

  if (type === "PAPER") return paperFamily("paper");
  if (type === "VELOCITY") return paperFamily("velocity");
  if (type === "WATERFALL") return paperFamily("waterfall");

  if (type === "PURPUR") {
    const listRes = await fetch("https://api.purpurmc.org/v2/purpur");
    const listData: any = await listRes.json();
    const ver = version || listData.versions[listData.versions.length - 1];
    await downloadFile(`https://api.purpurmc.org/v2/purpur/${ver}/latest/download`, jarPath);
    return;
  }

  if (type === "VANILLA") {
    const manifestRes = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
    const manifest: any = await manifestRes.json();
    const ver = version || manifest.latest.release;
    const entry = manifest.versions.find((v: any) => v.id === ver);
    if (!entry) throw new Error(`Unknown Minecraft version "${ver}"`);
    const versionJson: any = await (await fetch(entry.url)).json();
    const serverUrl = versionJson.downloads?.server?.url;
    if (!serverUrl) throw new Error(`No server jar published for version "${ver}"`);
    await downloadFile(serverUrl, jarPath);
    return;
  }

  throw new Error(
    `Native (no-Docker) mode doesn't have a built-in downloader for server type "${type}" yet. ` +
    `Quick-create supports PAPER, PURPUR, VELOCITY, WATERFALL and VANILLA in native mode — ` +
    `for anything else (Spigot, Forge, Fabric, Bedrock, BungeeCord, or any other software), ` +
    `upload it as a Pterodactyl egg instead: eggs bring their own install script, which works ` +
    `in native mode with no extra setup.`
  );
}

// Writes eula.txt and enables RCON in server.properties (auto-assigning a
// deterministic, per-server RCON port/password) for plain jar-based
// Minecraft servers. Proxies and egg-based servers manage their own config.
function rconPortFor(serverData: any): number {
  const base = parseInt(String(serverData.port), 10) || 25565;
  return 30000 + (base % 20000);
}

async function prepareMinecraftFiles(serverData: any) {
  const serverDir = serverDirFor(serverData.id);
  await fs.writeFile(path.join(serverDir, "eula.txt"), "eula=true\n");

  const propsPath = path.join(serverDir, "server.properties");
  let lines: string[] = [];
  if (await fs.pathExists(propsPath)) {
    lines = (await fs.readFile(propsPath, "utf8")).split("\n");
  }
  const propMap: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) propMap[m[1].trim()] = m[2];
  }
  propMap["server-port"] = String(serverData.port);
  propMap["enable-rcon"] = "true";
  if (!propMap["rcon.password"]) propMap["rcon.password"] = `xynex-${String(serverData.id).slice(0, 8)}`;
  if (!propMap["rcon.port"]) propMap["rcon.port"] = String(rconPortFor(serverData));

  const out = Object.entries(propMap).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  await fs.writeFile(propsPath, out);
}

// Runs the egg's install script (Pterodactyl eggs) or downloads the right
// jar (built-in quick-create types) directly on the host. Mirrors
// docker.ts's runInstallationScript, but with no container in between.
export async function runInstall(serverData: any, egg?: any): Promise<void> {
  const serverDir = serverDirFor(serverData.id);
  await fs.ensureDir(serverDir);

  if (serverData.installed === true) return;

  if (egg?.isPterodactyl && egg.installScript?.script) {
    const logDir = path.join(process.cwd(), ".data", "install-logs");
    await fs.ensureDir(logDir);
    const logFile = path.join(logDir, `${serverData.id}.log`);
    await fs.writeFile(logFile, `--- Running native installation for ${egg.name} ---\n`);

    const env = { ...process.env, ...buildEnvMap(serverData, egg) } as NodeJS.ProcessEnv;
    const script = String(egg.installScript.script).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    await new Promise<void>((resolve, reject) => {
      const child = spawn(shellPath(), ["-c", script], { cwd: serverDir, env });
      child.stdout.on("data", (d) => fs.appendFile(logFile, d.toString("utf8")).catch(() => {}));
      child.stderr.on("data", (d) => fs.appendFile(logFile, d.toString("utf8")).catch(() => {}));
      child.on("error", reject);
      child.on("close", async (code) => {
        await fs.appendFile(logFile, `\n--- Installation finished with exit code ${code ?? "unknown"} ---\n`);
        if (code && code !== 0) {
          let tail = "";
          try {
            const full = await fs.readFile(logFile, "utf8");
            tail = full.split("\n").filter((l) => l.trim().length > 0).slice(-8).join("\n");
          } catch (e) {
            // ignore, fall back to bare exit code below
          }
          reject(new Error(`Installation script exited with code ${code}.${tail ? `\n\nLast lines of install output:\n${tail}` : ""}`));
        } else {
          resolve();
        }
      });
    });

    await chmodServerDir(serverDir);
    serverData.installed = true;
    return;
  }

  if (!egg || !egg.isPterodactyl) {
    await installBuiltinJar(serverData);
    await chmodServerDir(serverDir);
    serverData.installed = true;
    return;
  }

  // Egg present but has no install script — nothing to do.
  serverData.installed = true;
}

function buildStartupCommand(serverData: any, egg?: any): { command: string; env: Record<string, string>; cwd: string } {
  const serverDir = serverDirFor(serverData.id);
  const envMap = buildEnvMap(serverData, egg);

  if (egg?.isPterodactyl && egg.startup) {
    return { command: substituteVars(egg.startup, envMap), env: envMap, cwd: serverDir };
  }

  const ramMb = Math.max(512, Math.round((parseFloat(serverData.ram) || 1) * 1024));
  return { command: `java -Xms128M -Xmx${ramMb}M -jar server.jar --nogui`, env: envMap, cwd: serverDir };
}

export async function startProcess(serverData: any, egg: any, serverId: string): Promise<void> {
  const existing = processes[serverId];
  if (existing && existing.proc.exitCode === null && !existing.proc.killed) {
    return; // already running
  }

  const type = (serverData.type || "").toUpperCase();
  const isProxy = ["VELOCITY", "BUNGEECORD", "WATERFALL"].includes(type);
  if ((!egg || !egg.isPterodactyl) && !isProxy) {
    await prepareMinecraftFiles(serverData);
  }

  const { command, env, cwd } = buildStartupCommand(serverData, egg);
  appendLog(serverId, `[System] Starting (native mode): ${command}\r\n`);

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(shellPath(), ["-c", command], {
      cwd,
      env: { ...process.env, ...env },
    }) as ChildProcessWithoutNullStreams;
  } catch (e: any) {
    appendLog(serverId, `\r\n[System] Failed to start process: ${e.message}\r\n`);
    throw e;
  }

  processes[serverId] = { proc: child, startedAt: Date.now() };

  child.stdout.on("data", (d) => appendLog(serverId, d.toString("utf8")));
  child.stderr.on("data", (d) => appendLog(serverId, d.toString("utf8")));
  child.on("close", (code) => {
    appendLog(serverId, `\r\n[System] Process exited with code ${code ?? "unknown"}.\r\n`);
    delete processes[serverId];
    delete lastCpuSample[serverId];
  });
  child.on("error", (err) => {
    appendLog(serverId, `\r\n[System] Process error: ${err.message}\r\n`);
    delete processes[serverId];
  });
}

export async function stopProcess(serverId: string): Promise<void> {
  const entry = processes[serverId];
  if (!entry) return;
  try {
    entry.proc.stdin.write("stop\n");
  } catch (e) {
    // stdin might already be closed — fall through to the timeout/kill below
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try { entry.proc.kill("SIGKILL"); } catch (e) {}
      resolve();
    }, 15000);
    entry.proc.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export async function killProcess(serverId: string): Promise<void> {
  const entry = processes[serverId];
  if (!entry) return;
  try {
    entry.proc.kill("SIGKILL");
  } catch (e) {
    // already dead — treat as success, matches docker.ts's killContainer
  }
}

export async function deleteProcess(serverId: string): Promise<void> {
  await killProcess(serverId);
  delete processes[serverId];
  delete lastCpuSample[serverId];
}

export function getStatus(serverId: string) {
  const entry = processes[serverId];
  const running = !!entry && entry.proc.exitCode === null && !entry.proc.killed;
  return { State: { Running: running, Status: running ? "running" : "exited" } };
}

export async function getStats(serverId: string) {
  const entry = processes[serverId];
  if (!entry || !entry.proc.pid || os.platform() !== "linux") {
    return { cpu: 0, ram: 0, disk: 0, netIn: 0, netOut: 0 };
  }
  const pid = entry.proc.pid;
  try {
    const statRaw = await fs.readFile(`/proc/${pid}/stat`, "utf8");
    const parts = statRaw.substring(statRaw.lastIndexOf(")") + 2).trim().split(/\s+/);
    const utime = parseInt(parts[11], 10) || 0;
    const stime = parseInt(parts[12], 10) || 0;
    const totalTicks = utime + stime;
    const clkTck = 100; // USER_HZ — standard on Linux
    const now = Date.now();

    let cpu = 0;
    const prev = lastCpuSample[serverId];
    if (prev) {
      const dtSec = (now - prev.time) / 1000;
      const dTicks = totalTicks - prev.cpuTicks;
      if (dtSec > 0) cpu = Math.max(0, (dTicks / clkTck / dtSec) * 100);
    }
    lastCpuSample[serverId] = { time: now, cpuTicks: totalTicks };

    let ramMb = 0;
    try {
      const statusRaw = await fs.readFile(`/proc/${pid}/status`, "utf8");
      const m = statusRaw.match(/VmRSS:\s+(\d+)\s+kB/);
      if (m) ramMb = parseInt(m[1], 10) / 1024;
    } catch (e) {
      // process may have just exited between reads — report 0 for this sample
    }

    return { cpu, ram: ramMb, disk: 0, netIn: 0, netOut: 0 };
  } catch (e) {
    return { cpu: 0, ram: 0, disk: 0, netIn: 0, netOut: 0 };
  }
}

export async function getLogs(serverId: string): Promise<string> {
  try {
    const full = await fs.readFile(logFileFor(serverId), "utf8");
    return full.split("\n").slice(-100).join("\n");
  } catch (e) {
    return "";
  }
}

export function sendCommand(serverId: string, command: string): void {
  const entry = processes[serverId];
  if (entry && entry.proc.stdin.writable) {
    entry.proc.stdin.write(command + "\n");
  }
}

async function readServerProperty(serverId: string, key: string): Promise<string | null> {
  try {
    const propsPath = path.join(serverDirFor(serverId), "server.properties");
    const content = await fs.readFile(propsPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && m[1].trim() === key) return m[2].trim();
    }
  } catch (e) {
    // no server.properties (e.g. proxy or non-Minecraft egg) — caller handles null
  }
  return null;
}

// Minimal Source RCON protocol client (auth + exec, no dependency needed) —
// talks to the same RCON port/password we wrote into server.properties in
// prepareMinecraftFiles, so this works for any jar-based Minecraft server
// running natively.
function rconPacket(id: number, type: number, body: string): Buffer {
  const bodyBuf = Buffer.from(body, "utf8");
  const size = 4 + 4 + bodyBuf.length + 2;
  const buf = Buffer.alloc(size + 4);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeInt16LE(0, 12 + bodyBuf.length);
  return buf;
}

export async function execRcon(serverId: string, command: string): Promise<string> {
  const port = parseInt((await readServerProperty(serverId, "rcon.port")) || "", 10);
  const password = await readServerProperty(serverId, "rcon.password");
  if (!port || !password) {
    throw new Error("RCON isn't available for this server (no rcon.port/rcon.password found).");
  }

  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let stage: "auth" | "command" = "auth";
    let buffer = Buffer.alloc(0);
    let output = "";
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (err) reject(err); else resolve(output.trim());
    };

    const timeout = setTimeout(() => finish(new Error("RCON connection timed out — is the server online?")), 5000);

    socket.on("connect", () => socket.write(rconPacket(1, 3, password))); // SERVERDATA_AUTH
    socket.on("error", (err) => finish(err));

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) break;
        const packet = buffer.subarray(4, size + 4);
        buffer = buffer.subarray(size + 4);
        const id = packet.readInt32LE(0);
        const body = packet.subarray(8, packet.length - 2).toString("utf8");

        if (stage === "auth") {
          if (id === -1) { finish(new Error("RCON authentication failed.")); return; }
          stage = "command";
          socket.write(rconPacket(2, 2, command)); // SERVERDATA_EXECCOMMAND
        } else {
          output += body;
          finish();
        }
      }
    });
  });
}
