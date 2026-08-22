import Docker from "dockerode";
import fs from "fs-extra";
import path from "path";
import { io } from "../../../server.js"; // Import socket for logs
import { readJSON } from "./db.js";

const getSocketPath = () => {
  if (process.platform === 'win32') return '//./pipe/docker_engine';
  if (process.env.DOCKER_SOCKET_PATH && fs.existsSync(process.env.DOCKER_SOCKET_PATH)) {
    return process.env.DOCKER_SOCKET_PATH;
  }
  if (process.env.CONTAINER_ENGINE === 'podman') {
    if (fs.existsSync('/run/podman/podman.sock')) return '/run/podman/podman.sock';
    if (fs.existsSync('/var/run/podman/podman.sock')) return '/var/run/podman/podman.sock';
  }
  if (fs.existsSync('/run/podman/podman.sock')) return '/run/podman/podman.sock';
  if (fs.existsSync('/var/run/podman/podman.sock')) return '/var/run/podman/podman.sock';
  if (fs.existsSync('/var/run/docker.sock')) return '/var/run/docker.sock';
  if (fs.existsSync('/run/docker.sock')) return '/run/docker.sock';
  return '/var/run/docker.sock';
};

export const isSandbox = !fs.existsSync('/var/run/docker.sock') &&
  !fs.existsSync('/run/podman/podman.sock') &&
  !fs.existsSync('/var/run/podman/podman.sock') &&
  !fs.existsSync('/run/docker.sock') &&
  !(process.env.DOCKER_SOCKET_PATH && fs.existsSync(process.env.DOCKER_SOCKET_PATH)) &&
  process.platform !== 'win32';

// Returns extra `source:target[:ro]` bind strings for any admin-defined
// Mount that applies to this server's egg (an empty eggIds list on the
// mount means "applies to every server"). Used to attach shared folders
// (e.g. a common mod/datapack cache) across multiple servers.
async function getMountBinds(serverData: any): Promise<string[]> {
  try {
    const mounts = (await readJSON("mounts.json")) || [];
    return mounts
      .filter((m: any) => !Array.isArray(m.eggIds) || m.eggIds.length === 0 || m.eggIds.includes(serverData.eggId))
      .map((m: any) => `${m.sourcePath}:${m.targetPath}${m.readOnly ? ":ro" : ""}`);
  } catch (e) {
    console.warn("Failed to load mounts:", e);
    return [];
  }
}

// Ensures the server's data directory exists and is writable by whichever
// user a container happens to run as. Different eggs' images run their
// main process as different users (root, a baked-in non-root "container"
// user, etc.), and the directory is first created by the panel's own
// Node process — so without this, a container can get "permission
// denied" just creating node_modules/etc. the very first time it touches
// its own volume, even before any install-script ownership mismatch.
async function ensureServerDirPermissive(serverDir: string): Promise<void> {
  await fs.ensureDir(serverDir);
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    await execAsync(`chmod -R 777 ${JSON.stringify(serverDir)}`);
  } catch (e) {
    console.warn("Could not chmod server directory:", e);
  }
}

export const docker = new Docker({ socketPath: getSocketPath() });

// Turns the panel's stored RAM (GB) / CPU (percent-of-one-core, Pterodactyl
// convention — 100 = 1 core) limits into real Docker HostConfig fields, so
// a server's resource limits are actually enforced by the OS/cgroups
// instead of only being passed to the process as an informational env var.
function buildResourceLimits(serverData: any): Record<string, any> {
  const limits: any = {};
  const ramGb = parseFloat(serverData?.ram);
  if (ramGb && ramGb > 0) {
    limits.Memory = Math.round(ramGb * 1024 * 1024 * 1024);
    limits.MemorySwap = limits.Memory; // no extra swap beyond the memory limit
  }
  const cpuPercent = parseFloat(serverData?.cpu);
  if (cpuPercent && cpuPercent > 0) {
    limits.NanoCpus = Math.round((cpuPercent / 100) * 1e9);
  }
  return limits;
}

// Mock state for sandbox demo
const mockState: Record<string, boolean> = {};

export const getVersions = async (type: string = "PAPER") => {
  const normalizedType = type.toUpperCase();
  if (normalizedType === "VELOCITY") {
    // Velocity's own real software release history, oldest -> latest.
    return [
      "1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5", "1.0.6", "1.0.7",
      "1.1.0", "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.6", "1.1.7", "1.1.8", "1.1.9",
      "3.0.0", "3.1.0", "3.1.1", "3.2.0", "3.3.0-SNAPSHOT", "3.4.0-SNAPSHOT", "4.1.0-SNAPSHOT",
      "latest",
    ];
  }

  // BungeeCord/Waterfall builds are scoped per Minecraft version (like
  // Paper/Spigot), so they share the same full release list below.
  return [
    "1.0", "1.1",
    "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
    "1.3.1", "1.3.2",
    "1.4.2", "1.4.4", "1.4.5", "1.4.6", "1.4.7",
    "1.5", "1.5.1", "1.5.2",
    "1.6.1", "1.6.2", "1.6.4",
    "1.7.2", "1.7.4", "1.7.5", "1.7.6", "1.7.7", "1.7.8", "1.7.9", "1.7.10",
    "1.8", "1.8.1", "1.8.2", "1.8.3", "1.8.4", "1.8.5", "1.8.6", "1.8.7", "1.8.8", "1.8.9",
    "1.9", "1.9.1", "1.9.2", "1.9.3", "1.9.4",
    "1.10", "1.10.1", "1.10.2",
    "1.11", "1.11.1", "1.11.2",
    "1.12", "1.12.1", "1.12.2",
    "1.13", "1.13.1", "1.13.2",
    "1.14", "1.14.1", "1.14.2", "1.14.3", "1.14.4",
    "1.15", "1.15.1", "1.15.2",
    "1.16", "1.16.1", "1.16.2", "1.16.3", "1.16.4", "1.16.5",
    "1.17", "1.17.1",
    "1.18", "1.18.1", "1.18.2",
    "1.19", "1.19.1", "1.19.2", "1.19.3", "1.19.4",
    "1.20", "1.20.1", "1.20.2", "1.20.3", "1.20.4", "1.20.5", "1.20.6",
    "1.21", "1.21.1", "1.21.2", "1.21.3", "1.21.4", "1.21.5", "1.21.6", "1.21.7", "1.21.8", "1.21.9", "1.21.10", "1.21.11",
    "latest",
  ];
};

export const createServerContainer = async (serverData: any, egg?: any) => {
  if (isSandbox) {
    mockState[serverData.id] = false;
    return "mock-container-id-" + serverData.id;
  }

  // Egg-based creation: the image, env vars, port var, and volume path all
  // come from the uploaded egg definition instead of being hardcoded here.
  if (egg) {
    return createServerContainerFromEgg(serverData, egg);
  }

  const serverType = serverData.type || "PAPER";
  const isProxy = ["VELOCITY", "BUNGEECORD", "WATERFALL"].includes(serverType.toUpperCase());
  const shortImage = isProxy ? "itzg/bungeecord:latest" : "itzg/minecraft-server:latest";
  const fullImage = isProxy ? "docker.io/itzg/bungeecord:latest" : "docker.io/itzg/minecraft-server:latest";

  const findImageId = async (): Promise<string | null> => {
    try {
      const images = await docker.listImages();
      const matched = images.find(img => 
        img.RepoTags && img.RepoTags.some(tag => tag.includes(shortImage) || tag.includes(fullImage))
      );
      if (matched) return matched.Id;
    } catch(e) {
      console.warn("Failed to list images:", e);
    }
    return null;
  };

  const pullImageStream = async (imgTag: string) => {
    console.log(`Pulling image ${imgTag}...`);
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    const engine = process.env.CONTAINER_ENGINE === "podman" ? "podman" : "docker";
    
    try {
      console.log(`Executing: ${engine} pull ${imgTag}`);
      const { stdout, stderr } = await execAsync(`${engine} pull ${imgTag}`);
      console.log(`${engine} pull stdout:`, stdout);
      if (stderr) console.warn(`${engine} pull stderr:`, stderr);
    } catch (cliErr) {
      console.warn(`CLI pull failed for ${imgTag}: ${cliErr}. Trying Docker API fallback...`);
      await new Promise((resolve, reject) => {
        docker.pull(imgTag, (err: any, stream: any) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err: any, output: any) => {
            if (err) return reject(err);
            resolve(output);
          });
        });
      });
    }
  };

  const ensureImage = async (): Promise<string> => {
    let existingId = await findImageId();
    if (existingId) return existingId;

    try {
      await pullImageStream(shortImage);
      let idAfterShort = await findImageId();
      if (idAfterShort) return idAfterShort;
    } catch (e) {
      console.warn(`Failed to pull ${shortImage}...`, e);
    }

    console.warn(`Attempting fallback pull with ${fullImage}...`);
    await pullImageStream(fullImage);
    let idAfterFull = await findImageId();
    if (idAfterFull) return idAfterFull;

    return shortImage; // Fallback to string tag if we somehow couldn't find ID
  };

  const targetImage = await ensureImage();

  const serverDir = path.join(process.cwd(), ".data", "servers", serverData.id);
  await ensureServerDirPermissive(serverDir);
  const mountBinds = await getMountBinds(serverData);

  const envVars = [
    `TYPE=${serverType}`,
    `VERSION=${serverData.version}`,
    `MEMORY=${serverData.ram}G`,
    `INIT_MEMORY=128M`,
    `SERVER_PORT=${serverData.port}`,
  ];

  if (!isProxy) {
    envVars.push(
      `EULA=TRUE`,
      `ENABLE_RCON=true`,
      `RCON_PASSWORD=admin`,
      `JVM_OPTS=-DPaper.IgnoreWorldDataVersion=true`,
      `JVM_DD_OPTS=Paper.IgnoreWorldDataVersion=true,paper.ignoreWorldDataVersion=true`
    );
  }

  const buildContainerOptions = (img: string) => ({
    Image: img,
    name: `xynex-server-${serverData.id}`,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    Env: envVars,
    ExposedPorts: {
      [`${serverData.port}/tcp`]: {}
    },
    HostConfig: {
      ...buildResourceLimits(serverData),
      PortBindings: {
        [`${serverData.port}/tcp`]: [
          {
            HostPort: `${serverData.port}`
          }
        ]
      },
      Binds: [`${serverDir}:${isProxy ? '/server' : '/data'}`, ...mountBinds]
    }
  });

  let container;
  try {
    container = await docker.createContainer(buildContainerOptions(targetImage));
  } catch (err: any) {
    const errStr = String(err?.message || err);
    if (err?.statusCode === 404 || errStr.includes("404") || errStr.includes("no such image")) {
      const altImage = targetImage === shortImage ? fullImage : shortImage;
      console.log(`404 image error with ${targetImage}. Attempting fallback with ${altImage}...`);
      try {
        await pullImageStream(altImage);
        container = await docker.createContainer(buildContainerOptions(altImage));
      } catch (fallbackErr) {
        console.log(`Pulling ${targetImage} directly and retrying...`);
        await pullImageStream(targetImage);
        container = await docker.createContainer(buildContainerOptions(targetImage));
      }
    } else {
      throw err;
    }
  }

  return container.id;
};

// Pulls an image via the CLI first (faster, shows normal docker/podman
// pull output), falling back to the Docker API if the CLI isn't usable.
export const pullImageGeneric = async (imgTag: string) => {
  const { exec } = require("child_process");
  const { promisify } = require("util");
  const execAsync = promisify(exec);
  const engine = process.env.CONTAINER_ENGINE === "podman" ? "podman" : "docker";
  try {
    await execAsync(`${engine} pull ${imgTag}`);
  } catch (cliErr) {
    await new Promise((resolve, reject) => {
      docker.pull(imgTag, (err: any, stream: any) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err: any, output: any) => {
          if (err) return reject(err);
          resolve(output);
        });
      });
    });
  }
};

// Creates a container using an "egg" definition: { dockerImage, portEnvVar,
// volumePath, envVars, versionEnvVar, versions }. This is how Create Server
// supports arbitrary software (not just Minecraft) once an egg is uploaded
// in Settings.
// Runs a Pterodactyl egg's installation script once, in a short-lived
// container, before the server's main container ever starts. This mirrors
// what Wings does: mount the (empty) server volume into the install
// container at /mnt/server, run the script with the egg's variables as
// env vars, and let it download/build the actual server software.
// Output is captured to a log file so the install can be inspected if it
// fails silently instead of crashing the (not-yet-existing) main container.
const runInstallationScript = async (serverData: any, egg: any): Promise<void> => {
  if (!egg.installScript || !egg.installScript.script) return;

  const serverDir = path.join(process.cwd(), ".data", "servers", serverData.id);
  await ensureServerDirPermissive(serverDir);
  const logDir = path.join(process.cwd(), ".data", "install-logs");
  await fs.ensureDir(logDir);
  const logFile = path.join(logDir, `${serverData.id}.log`);

  const installImage = egg.installScript.container || "alpine:3.4";
  try {
    await pullImageGeneric(installImage);
  } catch (e) {
    console.warn(`Failed to pull install image ${installImage}, trying anyway in case it's cached locally.`, e);
  }

  const env = buildPterodactylEnv(serverData, egg);

  const container = await docker.createContainer({
    Image: installImage,
    name: `xynex-install-${serverData.id}-${Date.now()}`,
    Entrypoint: [egg.installScript.entrypoint || "ash"],
    Cmd: ["-c", egg.installScript.script.replace(/\r\n/g, "\n").replace(/\r/g, "\n")],
    Env: env,
    WorkingDir: "/mnt/server",
    Tty: true,
    HostConfig: {
      Binds: [`${serverDir}:/mnt/server`],
      AutoRemove: false,
    },
  });

  await fs.writeFile(logFile, `--- Running installation script for ${egg.name} ---\n`);

  await container.start();

  // Tty:true means stdout/stderr are NOT multiplexed with Docker's frame
  // headers, so this stream is safe to write straight to the log file
  // (a non-Tty container's raw attach stream would need demuxing first).
  try {
    const logStream: any = await container.logs({ follow: true, stdout: true, stderr: true });
    logStream.on("data", (chunk: Buffer) => {
      fs.appendFile(logFile, chunk.toString("utf8")).catch(() => {});
    });
  } catch (e) {
    console.warn("Could not stream install container logs:", e);
  }

  const result: any = await container.wait();
  await fs.appendFile(logFile, `\n--- Installation finished with exit code ${result?.StatusCode ?? "unknown"} ---\n`);
  await container.remove().catch(() => {});

  if (result?.StatusCode && result.StatusCode !== 0) {
    // Surface the actual reason directly in the error the panel shows,
    // instead of just the exit code — this is almost always enough to
    // tell what went wrong (missing command, bad variable, network
    // failure, etc.) without having to go dig up the log file separately.
    let tail = "";
    try {
      const fullLog = await fs.readFile(logFile, "utf8");
      const lines = fullLog.split("\n").filter((l) => l.trim().length > 0);
      tail = lines.slice(-8).join("\n");
    } catch (e) {
      // ignore — fall back to just the exit code below
    }
    const detail = tail ? `\n\nLast lines of install output:\n${tail}` : "";
    throw new Error(`Installation script exited with code ${result.StatusCode}.${detail}`);
  }

  // The install container runs as root, but the egg's own image (e.g.
  // Python/Node "yolks" images) often runs its main process as a non-root
  // user. Without this, the main container can silently fail to read or
  // execute the files that were just installed (looks like "file not
  // found" even though it's really a permissions problem). Since the
  // install volume is a direct bind-mount of a host directory, this is a
  // plain host-side chmod — no extra container needed.
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    await execAsync(`chmod -R 777 ${JSON.stringify(serverDir)}`);
  } catch (e) {
    console.warn("Could not chmod server directory after install:", e);
  }
};

// Builds the standard set of env vars Pterodactyl eggs/images expect
// (STARTUP, SERVER_MEMORY/IP/PORT), then layers the egg's own variable
// defaults and any server-specific Startup-tab overrides on top.
function buildPterodactylEnv(serverData: any, egg: any): string[] {
  const env: string[] = [
    `STARTUP=${egg.startup || ""}`,
    `SERVER_MEMORY=${Math.round((parseFloat(serverData.ram) || 1) * 1024)}`,
    `SERVER_IP=0.0.0.0`,
    `SERVER_PORT=${serverData.port}`,
    `P_SERVER_LOCATION=local`,
    `P_SERVER_UUID=${serverData.id}`,
    `HOME=/home/container`,
    // Without this, Python's stdout is block-buffered when it isn't
    // attached to a real TTY-like pipe, so the console can appear to just
    // hang with no output until a buffer flush — a very common source of
    // "it's not doing anything" reports for Python eggs.
    `PYTHONUNBUFFERED=1`,
    `PIP_ROOT_USER_ACTION=ignore`,
  ];
  if (Array.isArray(egg.variables)) {
    for (const v of egg.variables) {
      if (v && v.envVariable) env.push(`${v.envVariable}=${v.defaultValue ?? ""}`);
    }
  }
  if (egg.envVars && typeof egg.envVars === "object") {
    for (const [key, value] of Object.entries(egg.envVars)) {
      env.push(`${key}=${value}`);
    }
  }
  if (serverData.variables && typeof serverData.variables === "object") {
    for (const [key, value] of Object.entries(serverData.variables)) {
      env.push(`${key}=${value}`);
    }
  }
  return env;
}

const createServerContainerFromEgg = async (serverData: any, egg: any) => {
  // Some eggs (e.g. imported Pterodactyl eggs) use a different Docker image
  // per version instead of one image + a VERSION env var.
  const image = (egg.versionImages && serverData.version && egg.versionImages[serverData.version])
    || egg.dockerImage;

  try {
    await pullImageGeneric(image);
  } catch (e) {
    console.warn(`Failed to pull ${image}, will still try to create the container in case it's already present locally.`, e);
  }

  const serverDir = path.join(process.cwd(), ".data", "servers", serverData.id);
  await ensureServerDirPermissive(serverDir);
  const volumePath = egg.volumePath || "/data";
  const mountBinds = await getMountBinds(serverData);

  // Real Pterodactyl eggs: run the installation script (once per
  // create/reinstall/version-change — callers reset serverData.installed
  // to false before invoking this to force a re-run) and use the
  // Pterodactyl-standard env vars, letting the egg's own Docker image
  // (its baked-in entrypoint) handle {{VARIABLE}} substitution of STARTUP.
  if (egg.isPterodactyl) {
    if (egg.installScript && serverData.installed !== true) {
      await runInstallationScript(serverData, egg);
      serverData.installed = true;
    }

    const env = buildPterodactylEnv(serverData, egg);
    if (egg.portEnvVar && egg.portEnvVar !== "SERVER_PORT") env.push(`${egg.portEnvVar}=${serverData.port}`);
    if (egg.versionEnvVar && serverData.version) env.push(`${egg.versionEnvVar}=${serverData.version}`);

    const container = await docker.createContainer({
      Image: image,
      name: `xynex-server-${serverData.id}`,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      Env: env,
      WorkingDir: volumePath,
      ExposedPorts: { [`${serverData.port}/tcp`]: {} },
      HostConfig: {
        ...buildResourceLimits(serverData),
        PortBindings: { [`${serverData.port}/tcp`]: [{ HostPort: `${serverData.port}` }] },
        Binds: [`${serverDir}:${volumePath}`, ...mountBinds],
      },
    });

    return container.id;
  }

  // Built-in (itzg-based) eggs: unchanged behavior — these images auto-manage
  // their own startup via simple env vars like MEMORY/VERSION/TYPE.
  const env: string[] = [];
  if (egg.portEnvVar) env.push(`${egg.portEnvVar}=${serverData.port}`);
  env.push(`MEMORY=${serverData.ram}G`);
  env.push(`INIT_MEMORY=128M`);
  if (egg.versionEnvVar && serverData.version) {
    env.push(`${egg.versionEnvVar}=${serverData.version}`);
  }
  if (egg.envVars && typeof egg.envVars === "object") {
    for (const [key, value] of Object.entries(egg.envVars)) {
      env.push(`${key}=${value}`);
    }
  }
  // Apply any user-edited Startup-tab variables on top of the egg's
  // defaults, so changes made there are reflected the next time the
  // container is (re)created.
  if (serverData.variables && typeof serverData.variables === "object") {
    for (const [key, value] of Object.entries(serverData.variables)) {
      env.push(`${key}=${value}`);
    }
  }

  const container = await docker.createContainer({
    Image: image,
    name: `xynex-server-${serverData.id}`,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    Env: env,
    ExposedPorts: {
      [`${serverData.port}/tcp`]: {}
    },
    HostConfig: {
      ...buildResourceLimits(serverData),
      PortBindings: {
        [`${serverData.port}/tcp`]: [
          { HostPort: `${serverData.port}` }
        ]
      },
      Binds: [`${serverDir}:${volumePath}`, ...mountBinds]
    }
  });

  return container.id;
};

export const startContainer = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = true;
    
    // In sandbox mode, mock the generation of server files that the docker container would normally do
    try {
      const servers = await readJSON("servers.json") || [];
      const server = servers.find((s: any) => s.id === id);
      if (server) {
        const serverDir = path.join(process.cwd(), ".data", "servers", id);
        await fs.ensureDir(serverDir);
        const type = (server.type || "PAPER").toUpperCase();
        
        if (["VELOCITY", "BUNGEECORD", "WATERFALL"].includes(type)) {
          const configName = type === "VELOCITY" ? "velocity.toml" : "config.yml";
          const configPath = path.join(serverDir, configName);
          if (!fs.existsSync(configPath)) {
            await fs.writeFile(configPath, "# Autogenerated proxy config in sandbox mode\n# Port: " + server.port + "\n");
          }
        } else {
          const propsPath = path.join(serverDir, "server.properties");
          if (!fs.existsSync(propsPath)) {
            await fs.writeFile(propsPath, "server-port=" + server.port + "\nmotd=A Minecraft Server\n");
          }
        }
      }
    } catch(e) {}
    
    io.to(`server_${id}`).emit("log", `[System] Server started (Sandbox Mode).\r\n`);
    return;
  }
  const container = docker.getContainer(containerId);
  await container.start();
};

export const stopContainer = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = false;
    io.to(`server_${id}`).emit("log", `[System] Server stopped (Sandbox Mode).\r\n`);
    return;
  }
  const container = docker.getContainer(containerId);
  await container.stop();
};

export const restartContainer = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = true;
    io.to(`server_${id}`).emit("log", `[System] Server restarted (Sandbox Mode).\r\n`);
    return;
  }
  const container = docker.getContainer(containerId);
  await container.restart();
};

export const killContainer = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    mockState[id] = false;
    io.to(`server_${id}`).emit("log", `[System] Server terminated (Sandbox Mode).\r\n`);
    return;
  }
  const container = docker.getContainer(containerId);
  try {
    await container.kill();
  } catch (err: any) {
    // Already stopped/not running — treat as success.
    if (!(err && (err.statusCode === 404 || err.statusCode === 409))) {
      throw err;
    }
  }
};

export const deleteContainer = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    delete mockState[id];
    return;
  }
  const container = docker.getContainer(containerId);
  try {
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
    await container.remove({ force: true });
  } catch (err) {
    console.error("Error deleting container", err);
  }
};

export const getContainerStatus = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    const isRunning = mockState[id] || false;
    return { State: { Running: isRunning, Status: isRunning ? "running" : "exited" } };
  }
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info;
  } catch (e) {
    return null;
  }
};

export const getContainerStats = async (containerId: string) => {
  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    if (!mockState[id]) return { cpu: 0, ram: 0, disk: 0 };
    
    // Stable pseudo-random mock stats based on time so it fluctuates realistically
    const timeSec = Math.floor(Date.now() / 5000);
    const floatPseudo = (Math.sin(timeSec + id.charCodeAt(0)) + 1) / 2; // 0 to 1
    
    return {
      cpu: floatPseudo * 10 + 2, // 2% to 12%
      ram: 600 + (floatPseudo * 50 - 25), // ~600 MB
      disk: 2.1
    };
  }
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    if (!info.State.Running) {
      return { cpu: 0, ram: 0, disk: 0 };
    }
    const statsResult = await container.stats({ stream: false });
    
    let cpuPercent = 0.0;
    try {
      const cpuDelta = statsResult.cpu_stats.cpu_usage.total_usage - statsResult.precpu_stats.cpu_usage.total_usage;
      const systemDelta = statsResult.cpu_stats.system_cpu_usage - statsResult.precpu_stats.system_cpu_usage;
      if (systemDelta > 0.0 && cpuDelta > 0.0) {
        const cpus = statsResult.cpu_stats.online_cpus || statsResult.cpu_stats.cpu_usage.percpu_usage?.length || 1;
        cpuPercent = (cpuDelta / systemDelta) * cpus * 100.0;
      }
    } catch(e) {}

    let ramMB = 0.0;
    try {
      const stats = statsResult.memory_stats.stats as any || {};
      const cache = stats.cache || stats.inactive_file || stats.total_inactive_file || 0;
      const usedMemory = statsResult.memory_stats.usage - cache;
      ramMB = usedMemory / 1024 / 1024;
    } catch(e) {}

    // Roughly calculate disk size from the volume directory if possible, or provide a default for now.
    return {
      cpu: cpuPercent,
      ram: ramMB,
      disk: 2.1
    };
  } catch (e) {
    return { cpu: 0, ram: 0, disk: 0 };
  }
};

export const getContainerLogs = async (containerId: string): Promise<string> => {
  if (isSandbox) return "[System] Sandbox mode. No historical logs available.\r\n";
  try {
    const container = docker.getContainer(containerId);
    
    // Convert Buffer log output to string safely. dockerode returns interleaved multiplexed streams if tty is false,
    // but we use tty: true in createServerContainer, so it's a raw stream buffer.
    const logsBuffer = await container.logs({ stdout: true, stderr: true, tail: 100 });
    return logsBuffer.toString('utf8');
  } catch (e) {
    return "";
  }
};

const activeStreams: Record<string, NodeJS.ReadWriteStream> = {};

export const attachContainerSocket = async (containerId: string, serverId: string) => {
  if (isSandbox) {
    return;
  }
  try {
    const container = docker.getContainer(containerId);
    if (!activeStreams[containerId]) {
      const stream = await container.attach({ stream: true, stdout: true, stderr: true, stdin: true });
      activeStreams[containerId] = stream;
      stream.on('data', (chunk) => {
        io.to(`server_${serverId}`).emit("log", chunk.toString());
      });
      stream.on('end', () => {
        delete activeStreams[containerId];
      });
    }
  } catch(e) {
    console.error("Attach error", e);
  }
};

export const sendContainerCommand = async (containerId: string, command: string) => {

  if (isSandbox) {
    const id = containerId.replace("mock-container-id-", "");
    // Handled by client local echo
    return;
  }
  if (activeStreams[containerId]) {
    activeStreams[containerId].write(command + "\n");
  } else {
    try {
      const container = docker.getContainer(containerId);
      const stream = await container.attach({ stream: true, stdout: true, stderr: true, stdin: true });
      activeStreams[containerId] = stream;
      stream.write(command + "\n");
      stream.on('data', (chunk) => {
        // Will be broadcasted due to existing or new attach
      });
    } catch(e) {
       console.error("Command error", e);
    }
  }
};

// Runs a command via rcon-cli inside the container and returns its text
// output (unlike sendContainerCommand, which just writes to stdin with no
// return value). Used by extensions that need to show a result — e.g.
// listing online players. Requires ENABLE_RCON=true on the container,
// which the built-in Minecraft eggs already set.
export const execRconCommand = async (containerId: string, command: string): Promise<string> => {
  if (isSandbox) {
    if (command.trim() === "list") {
      return "There are 0 of a max of 20 players online:";
    }
    return `[Sandbox] Simulated response for: ${command}`;
  }

  try {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ["rcon-cli", command],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    return await new Promise<string>((resolve, reject) => {
      let output = "";
      docker.modem.demuxStream(
        stream,
        { write: (chunk: Buffer) => { output += chunk.toString("utf8"); } },
        { write: (chunk: Buffer) => { output += chunk.toString("utf8"); } }
      );
      stream.on("end", () => resolve(output.trim()));
      stream.on("error", reject);
    });
  } catch (e: any) {
    throw new Error(e.message || "Failed to run RCON command — is the server online?");
  }
};
