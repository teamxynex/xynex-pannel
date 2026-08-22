import { Request, Response } from "express";
import { readJSON, writeJSON } from "../services/db.js";
import { createServerContainer, startContainer, stopContainer, restartContainer, killContainer, deleteContainer, getContainerStatus, sendContainerCommand, attachContainerSocket, getContainerStats, execRconCommand } from "../services/docker.js";
import { createSftpUser, deleteSftpUser } from "../services/sftp.js";
import { startPlayitTunnel } from "../services/playit.js";
import crypto from "crypto";
import fs from "fs-extra";
import { open as openFileHandle } from "fs/promises";
import path from "path";
import { ZipArchive } from "archiver";
import extract from "extract-zip";
import nbt from "prismarine-nbt";
import { promisify } from "util";
import { logActivity, requestActor } from "../services/activityLog.js";

// Merged from Jtg panel: reads a world's level.dat via real NBT parsing so
// the World Manager can show the actual Minecraft version / data version /
// in-game world name instead of just the folder name.
const parseLevelDatNbt = promisify(nbt.parse);
async function readWorldNbtInfo(worldDir: string): Promise<{ worldVersion: string; dataVersion: number; worldName: string } | null> {
  const levelDatPath = path.join(worldDir, "level.dat");
  if (!(await fs.pathExists(levelDatPath))) return null;
  try {
    const buffer = await fs.readFile(levelDatPath);
    const { parsed } = (await parseLevelDatNbt(buffer)) as any;
    const data = parsed?.value?.Data?.value;
    if (!data) return null;
    return {
      worldVersion: data.Version?.value?.Name?.value || "Unknown",
      dataVersion: data.DataVersion?.value || 0,
      worldName: data.LevelName?.value || "",
    };
  } catch (err) {
    console.warn("Could not read level.dat NBT for", worldDir, err);
    return null;
  }
}

export const getServers = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const servers = await readJSON("servers.json") || [];
  
  // Filter for normal users
  const userServers = user.role === "admin" || user.role === "owner" ? servers : servers.filter((s: any) => s.owner === user.id);

  // Update statuses
  const updatedServers = await Promise.all(userServers.map(async (server: any) => {
    if (server.containerId) {
      const status = await getContainerStatus(server.containerId);
      server.status = status?.State?.Running ? "online" : "offline";
    }
    return server;
  }));

  res.json(updatedServers);
};

// ---- World Manager (Java-style top-level world folders + Bedrock's
// worlds/<name> convention) ----

async function findWorldRoots(id: string): Promise<{ dir: string; bedrockStyle: boolean }[]> {
  const base = path.join(process.cwd(), ".data", "servers", id);
  const roots: { dir: string; bedrockStyle: boolean }[] = [{ dir: base, bedrockStyle: false }];
  const bedrockWorldsDir = path.join(base, "worlds");
  if (await fs.pathExists(bedrockWorldsDir)) {
    roots.push({ dir: bedrockWorldsDir, bedrockStyle: true });
  }
  return roots;
}

async function getActiveLevelName(id: string): Promise<string | null> {
  const propsPath = path.join(process.cwd(), ".data", "servers", id, "server.properties");
  try {
    const content = await fs.readFile(propsPath, "utf8");
    const match = content.match(/^level-name=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
}

export const getWorlds = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const activeLevelName = await getActiveLevelName(id);
    const worlds: any[] = [];

    for (const { dir, bedrockStyle } of await findWorldRoots(id)) {
      if (!(await fs.pathExists(dir))) continue;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const worldDir = path.join(dir, entry.name);
        const hasLevelDat = await fs.pathExists(path.join(worldDir, "level.dat"));
        if (!hasLevelDat) continue;
        const stat = await fs.stat(worldDir);
        const nbtInfo = await readWorldNbtInfo(worldDir);
        worlds.push({
          name: entry.name,
          bedrockStyle,
          active: entry.name === activeLevelName,
          modifiedAt: stat.mtime,
          worldName: nbtInfo?.worldName || undefined,
          worldVersion: nbtInfo?.worldVersion || undefined,
          dataVersion: nbtInfo?.dataVersion || undefined,
        });
      }
    }

    res.json({ worlds, activeLevelName });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list worlds" });
  }
};

export const uploadWorld = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const baseDir = path.join(process.cwd(), ".data", "servers", id);
    const worldName = (req.body.worldName || path.basename(req.file.originalname, path.extname(req.file.originalname))).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const isBedrock = req.body.bedrockStyle === "true" || req.body.bedrockStyle === true;
    const destDir = isBedrock ? path.join(baseDir, "worlds", worldName) : path.join(baseDir, worldName);

    if (!destDir.startsWith(baseDir)) return res.status(403).json({ error: "Invalid world name" });

    await fs.ensureDir(path.dirname(destDir));
    await fs.remove(destDir);
    await fs.ensureDir(destDir);
    await extract(req.file.path, { dir: destDir });
    await fs.remove(req.file.path).catch(() => {});

    // A .zip of a world folder is very commonly one extra level deep
    // (zip contains a single top-level folder that itself has level.dat) —
    // flatten that automatically so the world is usable without the user
    // needing to know or fix this themselves.
    const entries = await fs.readdir(destDir);
    if (entries.length === 1) {
      const inner = path.join(destDir, entries[0]);
      const innerStat = await fs.stat(inner);
      if (innerStat.isDirectory() && (await fs.pathExists(path.join(inner, "level.dat")))) {
        const tmp = destDir + "-tmp";
        await fs.move(inner, tmp);
        await fs.remove(destDir);
        await fs.move(tmp, destDir);
      }
    }

    res.json({ success: true, worldName });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to upload world" });
  }
};

export const switchWorld = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worldName } = req.body;
    if (!worldName) return res.status(400).json({ error: "worldName is required" });

    const propsPath = path.join(process.cwd(), ".data", "servers", id, "server.properties");
    let content = "";
    try {
      content = await fs.readFile(propsPath, "utf8");
    } catch (e) {
      content = "";
    }
    if (/^level-name=/m.test(content)) {
      content = content.replace(/^level-name=.*$/m, `level-name=${worldName}`);
    } else {
      content += `${content.endsWith("\n") || content === "" ? "" : "\n"}level-name=${worldName}\n`;
    }
    await fs.writeFile(propsPath, content, "utf8");
    res.json({ success: true, activeLevelName: worldName });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to switch world" });
  }
};

export const downloadWorld = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worldName, bedrockStyle } = req.query;
    if (!worldName) return res.status(400).json({ error: "worldName is required" });

    const baseDir = path.join(process.cwd(), ".data", "servers", id);
    const worldDir = bedrockStyle === "true"
      ? path.join(baseDir, "worlds", String(worldName))
      : path.join(baseDir, String(worldName));
    if (!worldDir.startsWith(baseDir) || !(await fs.pathExists(worldDir))) {
      return res.status(404).json({ error: "World not found" });
    }

    res.attachment(`${worldName}.zip`);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: any) => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
    archive.pipe(res);
    archive.directory(worldDir, String(worldName));
    await archive.finalize();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err.message || "Failed to download world" });
  }
};

export const deleteWorld = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worldName, bedrockStyle } = req.body;
    if (!worldName) return res.status(400).json({ error: "worldName is required" });

    const baseDir = path.join(process.cwd(), ".data", "servers", id);
    const worldDir = bedrockStyle ? path.join(baseDir, "worlds", worldName) : path.join(baseDir, worldName);
    if (!worldDir.startsWith(baseDir)) return res.status(403).json({ error: "Invalid path" });

    await fs.remove(worldDir);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete world" });
  }
};

// ---- Bedrock Addons (.mcpack / .mcaddon behavior & resource packs) ----

async function readPackManifest(packDir: string): Promise<any | null> {
  try {
    return await fs.readJson(path.join(packDir, "manifest.json"));
  } catch (e) {
    return null;
  }
}

function packKind(manifest: any): "behavior" | "resource" | null {
  const modules = manifest?.modules || [];
  if (modules.some((m: any) => m.type === "data" || m.type === "script")) return "behavior";
  if (modules.some((m: any) => m.type === "resources")) return "resource";
  return null;
}

async function registerPack(worldDir: string, kind: "behavior" | "resource", manifest: any) {
  const file = path.join(worldDir, kind === "behavior" ? "world_behavior_packs.json" : "world_resource_packs.json");
  let list: any[] = [];
  try { list = await fs.readJson(file); } catch (e) { list = []; }
  const packId = manifest?.header?.uuid;
  const version = manifest?.header?.version || [1, 0, 0];
  if (!packId) return;
  list = list.filter((p: any) => p.pack_id !== packId);
  list.push({ pack_id: packId, version });
  await fs.writeJson(file, list, { spaces: 2 });
}

async function unregisterPack(worldDir: string, kind: "behavior" | "resource", packId: string) {
  const file = path.join(worldDir, kind === "behavior" ? "world_behavior_packs.json" : "world_resource_packs.json");
  let list: any[] = [];
  try { list = await fs.readJson(file); } catch (e) { return; }
  list = list.filter((p: any) => p.pack_id !== packId);
  await fs.writeJson(file, list, { spaces: 2 });
}

export const getAddons = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worldName } = req.query;
    if (!worldName) return res.status(400).json({ error: "worldName is required" });
    const worldDir = path.join(process.cwd(), ".data", "servers", id, "worlds", String(worldName));

    const addons: any[] = [];
    for (const kind of ["behavior_packs", "resource_packs"] as const) {
      const dir = path.join(worldDir, kind);
      if (!(await fs.pathExists(dir))) continue;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifest = await readPackManifest(path.join(dir, entry.name));
        if (!manifest) continue;
        addons.push({
          folder: entry.name,
          kind: kind === "behavior_packs" ? "behavior" : "resource",
          name: manifest?.header?.name || entry.name,
          description: manifest?.header?.description || "",
          version: (manifest?.header?.version || []).join("."),
          packId: manifest?.header?.uuid,
        });
      }
    }
    res.json({ addons });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list addons" });
  }
};

export const uploadAddon = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { worldName } = req.body;
  if (!worldName) return res.status(400).json({ error: "worldName is required" });

  try {
    const worldDir = path.join(process.cwd(), ".data", "servers", id, "worlds", String(worldName));
    if (!(await fs.pathExists(worldDir))) return res.status(404).json({ error: "World not found" });

    // .mcaddon can bundle several packs; .mcpack is always exactly one.
    // Both are plain zip files under the hood, so extract to a scratch
    // folder first and then sort out what's inside.
    const scratchDir = path.join(process.cwd(), ".data", "temp", `addon-${crypto.randomUUID()}`);
    await fs.ensureDir(scratchDir);
    await extract(req.file.path, { dir: scratchDir });
    await fs.remove(req.file.path).catch(() => {});

    // Find every folder (including the scratch root itself) that has its
    // own manifest.json — that's one pack.
    const candidateDirs: string[] = [];
    const topEntries = await fs.readdir(scratchDir, { withFileTypes: true });
    if (await fs.pathExists(path.join(scratchDir, "manifest.json"))) {
      candidateDirs.push(scratchDir);
    } else {
      for (const entry of topEntries) {
        if (entry.isDirectory() && (await fs.pathExists(path.join(scratchDir, entry.name, "manifest.json")))) {
          candidateDirs.push(path.join(scratchDir, entry.name));
        }
      }
    }

    if (candidateDirs.length === 0) {
      await fs.remove(scratchDir);
      return res.status(400).json({ error: "No valid pack (manifest.json) found in the uploaded file." });
    }

    const installed: any[] = [];
    for (const packDir of candidateDirs) {
      const manifest = await readPackManifest(packDir);
      const kind = packKind(manifest);
      if (!kind) continue;
      const folderName = (manifest?.header?.name || path.basename(packDir)).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      const destDir = path.join(worldDir, kind === "behavior" ? "behavior_packs" : "resource_packs", folderName);
      await fs.remove(destDir);
      await fs.ensureDir(path.dirname(destDir));
      await fs.copy(packDir, destDir);
      await registerPack(worldDir, kind, manifest);
      installed.push({ name: manifest?.header?.name || folderName, kind });
    }

    await fs.remove(scratchDir);

    if (installed.length === 0) {
      return res.status(400).json({ error: "Pack manifest didn't declare a recognizable behavior/resource module type." });
    }
    res.json({ success: true, installed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to install addon" });
  }
};

export const deleteAddon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worldName, folder, kind, packId } = req.body;
    if (!worldName || !folder || !kind) return res.status(400).json({ error: "worldName, folder, and kind are required" });

    const worldDir = path.join(process.cwd(), ".data", "servers", id, "worlds", String(worldName));
    const packDir = path.join(worldDir, kind === "behavior" ? "behavior_packs" : "resource_packs", folder);
    if (!packDir.startsWith(worldDir)) return res.status(403).json({ error: "Invalid path" });

    await fs.remove(packDir);
    if (packId) await unregisterPack(worldDir, kind, packId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete addon" });
  }
};

// ---- FiveM / RedM Resource Manager ----

async function readServerCfg(serverDir: string): Promise<string> {
  try {
    return await fs.readFile(path.join(serverDir, "server.cfg"), "utf8");
  } catch (e) {
    return "";
  }
}

function isResourceEnsured(cfg: string, name: string): boolean {
  const re = new RegExp(`^\\s*ensure\\s+${name}\\s*$`, "m");
  return re.test(cfg);
}

export const getResources = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const resourcesDir = path.join(serverDir, "resources");
    const cfg = await readServerCfg(serverDir);

    const resources: any[] = [];
    if (await fs.pathExists(resourcesDir)) {
      const entries = await fs.readdir(resourcesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        resources.push({ name: entry.name, enabled: isResourceEnsured(cfg, entry.name) });
      }
    }
    res.json({ resources });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list resources" });
  }
};

async function ensureResourceInCfg(serverDir: string, name: string, enable: boolean) {
  const cfgPath = path.join(serverDir, "server.cfg");
  let cfg = await readServerCfg(serverDir);
  const already = isResourceEnsured(cfg, name);
  if (enable && !already) {
    cfg += `${cfg.endsWith("\n") || cfg === "" ? "" : "\n"}ensure ${name}\n`;
  } else if (!enable && already) {
    const re = new RegExp(`^\\s*ensure\\s+${name}\\s*$\\n?`, "m");
    cfg = cfg.replace(re, "");
  }
  await fs.writeFile(cfgPath, cfg, "utf8");
}

export const uploadResource = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const resourceName = (req.body.resourceName || path.basename(req.file.originalname, path.extname(req.file.originalname))).replace(/[^a-zA-Z0-9_\-]/g, "_");
    const destDir = path.join(serverDir, "resources", resourceName);
    if (!destDir.startsWith(serverDir)) return res.status(403).json({ error: "Invalid resource name" });

    await fs.remove(destDir);
    await fs.ensureDir(destDir);
    await extract(req.file.path, { dir: destDir });
    await fs.remove(req.file.path).catch(() => {});

    // Zips of a single resource are very often one folder deeper than
    // expected (contains one top-level folder with fxmanifest.lua inside).
    const entries = await fs.readdir(destDir);
    if (entries.length === 1) {
      const inner = path.join(destDir, entries[0]);
      const innerStat = await fs.stat(inner);
      if (innerStat.isDirectory()) {
        const hasManifest = (await fs.pathExists(path.join(inner, "fxmanifest.lua"))) || (await fs.pathExists(path.join(inner, "__resource.lua")));
        if (hasManifest) {
          const tmp = destDir + "-tmp";
          await fs.move(inner, tmp);
          await fs.remove(destDir);
          await fs.move(tmp, destDir);
        }
      }
    }

    await ensureResourceInCfg(serverDir, resourceName, true);
    res.json({ success: true, resourceName });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to install resource" });
  }
};

export const installResourceFromGit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { gitUrl, resourceName: rawName } = req.body;
    if (!gitUrl) return res.status(400).json({ error: "gitUrl is required" });

    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const resourceName = (rawName || path.basename(String(gitUrl), ".git")).replace(/[^a-zA-Z0-9_\-]/g, "_");
    const destDir = path.join(serverDir, "resources", resourceName);
    if (!destDir.startsWith(serverDir)) return res.status(403).json({ error: "Invalid resource name" });

    await fs.remove(destDir);
    await fs.ensureDir(path.dirname(destDir));

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    // Only allow http(s) git URLs — blocks local file:// paths or shell
    // metacharacters from being smuggled in through this field.
    if (!/^https?:\/\/[a-zA-Z0-9._\-\/]+(\.git)?$/.test(String(gitUrl))) {
      return res.status(400).json({ error: "gitUrl must be a plain https:// GitHub/GitLab URL" });
    }
    await execAsync(`git clone --depth 1 ${JSON.stringify(gitUrl)} ${JSON.stringify(destDir)}`);
    await fs.remove(path.join(destDir, ".git")).catch(() => {});

    await ensureResourceInCfg(serverDir, resourceName, true);
    res.json({ success: true, resourceName });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to install resource from git" });
  }
};

export const toggleResource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, enabled } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    await ensureResourceInCfg(serverDir, name, !!enabled);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to toggle resource" });
  }
};

export const deleteResource = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const resourceDir = path.join(serverDir, "resources", name);
    if (!resourceDir.startsWith(serverDir)) return res.status(403).json({ error: "Invalid path" });

    await fs.remove(resourceDir);
    await ensureResourceInCfg(serverDir, name, false);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete resource" });
  }
};

const FRAMEWORK_REPOS: Record<string, string> = {
  esx: "https://github.com/esx-framework/esx_core.git",
  qbcore: "https://github.com/qbcore-framework/qb-core.git",
};

export const installFramework = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { framework } = req.body;
    const repoUrl = FRAMEWORK_REPOS[String(framework)];
    if (!repoUrl) return res.status(400).json({ error: "Unknown framework. Supported: esx, qbcore" });

    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const resourceName = framework === "esx" ? "es_extended" : "qb-core";
    const destDir = path.join(serverDir, "resources", resourceName);

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    await fs.remove(destDir);
    await fs.ensureDir(path.dirname(destDir));
    await execAsync(`git clone --depth 1 ${JSON.stringify(repoUrl)} ${JSON.stringify(destDir)}`);
    await fs.remove(path.join(destDir, ".git")).catch(() => {});
    await ensureResourceInCfg(serverDir, resourceName, true);

    res.json({ success: true, resourceName });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to install framework" });
  }
};

export const getInstallLogs = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const logFile = path.join(process.cwd(), ".data", "install-logs", `${id}.log`);
    const content = await fs.readFile(logFile, "utf8").catch(() => "");
    res.json({ log: content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getServer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const status = await getContainerStatus(server.containerId);
  server.status = status?.State?.Running ? "online" : "offline";
  res.json(server);
};

export const getServerStats = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;
  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (server.containerId) {
    const stats = await getContainerStats(server.containerId);
    res.json({
      ...stats,
      limitRam: server.ram ? server.ram * 1024 : 1024,
      limitCpu: server.cpu || 100,
      limitDisk: server.disk || 10
    });
  } else {
    res.json({ cpu: 0, ram: 0, disk: 0, limitRam: server.ram ? server.ram * 1024 : 1024, limitCpu: server.cpu || 100, limitDisk: server.disk || 10 });
  }
};

export const createServer = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Only admins can create servers" });
  }
  const { name, ram, port, version, theme, cpu, disk, owner, ipAlias, type, eggId, expirationDate, nodeId, allocationId } = req.body;
  if (!name || !ram || !port) {
    res.status(400).json({ error: "Missing required fields (name, ram, port)" });
    return;
  }

  // Look up the selected egg (server template). Falls back to the legacy
  // hardcoded Minecraft "type" field if no eggId was sent, for backward
  // compatibility with older clients/scripts.
  let egg: any = null;
  if (eggId) {
    const eggs = await readJSON("eggs.json") || [];
    egg = eggs.find((e: any) => e.id === eggId);
    if (!egg) {
      res.status(400).json({ error: "Selected egg was not found. It may have been deleted." });
      return;
    }
  }

  const id = crypto.randomUUID();
  const serverData: any = {
    id,
    name,
    owner: owner || user.id, // Support assigning owner at creation
    ram,
    cpu: cpu || 100,
    disk: disk || 10,
    port,
    ipAlias: ipAlias || "",
    // Which node (real remote node, or omitted for the implicit Local Node)
    // this server was provisioned on — informational for now, surfaced in
    // the admin Nodes tab / server details.
    nodeId: nodeId || null,
    type: type || (egg ? egg.name : "PAPER"),
    version: version || (egg && egg.versions && egg.versions[egg.versions.length - 1]) || "1.21.11",
    theme: theme || "default",
    status: "installing",
    createdAt: new Date().toISOString(),
    containerId: null,
    // Auto-suspension: when set, a background check suspends this server
    // automatically once this date/time passes (see services/scheduler.ts).
    expirationDate: expirationDate || null,
  };

  if (egg) {
    serverData.eggId = egg.id;
    serverData.eggName = egg.name;
    serverData.category = egg.category;
    // Only keep a version if this egg actually has selectable versions.
    if (!egg.versions || egg.versions.length === 0) {
      delete serverData.version;
    }
    // Seed this server's own copy of the egg's startup variables (so the
    // Startup tab has something to show/edit even before any container
    // has started, and edits don't mutate the shared egg definition).
    if (Array.isArray(egg.variables) && egg.variables.length > 0) {
      serverData.variables = {};
      for (const v of egg.variables) {
        if (v && v.envVariable) serverData.variables[v.envVariable] = v.defaultValue ?? "";
      }
    }
  }

  const servers = await readJSON("servers.json") || [];
  
  if (servers.find((s: any) => s.port == port)) {
    res.status(400).json({ error: "Port is already in use by another server." });
    return;
  }

  servers.push(serverData);
  await writeJSON("servers.json", servers);

  // If this server was provisioned against a real node's allocation, mark
  // that allocation as used so it isn't handed out to another server.
  if (allocationId) {
    try {
      const allocations = await readJSON("allocations.json") || [];
      const alloc = allocations.find((a: any) => a.id === allocationId);
      if (alloc) {
        alloc.assigned = true;
        await writeJSON("allocations.json", allocations);
      }
    } catch (e) {
      console.error("Failed to mark allocation as assigned:", e);
    }
  }

  try {
    const containerId = await createServerContainer(serverData, egg);
    serverData.containerId = containerId;
    serverData.status = "offline";
    await writeJSON("servers.json", Object.assign(servers, servers.map((s:any)=>s.id===id?serverData:s)));
    await createSftpUser(id).catch(e => console.error("SFTP user creation failed:", e));

    // No real VPS IP configured means players have no way to reach this
    // server directly — auto-start a Playit tunnel (if enabled) so it's
    // reachable without the admin needing to find the Playit tab first.
    try {
      const settings = await readJSON("settings.json") || {};
      if (!settings.nodeIp && settings.enablePlayit) {
        const serverName = serverData.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        startPlayitTunnel(id, serverName).catch((e) => console.warn("Auto-start Playit tunnel failed:", e));
      }
    } catch (e) {
      console.warn("Could not check settings for Playit auto-start:", e);
    }

    logActivity({ ...requestActor(req), serverId: serverData.id, serverName: serverData.name, action: "server.create", description: `Created server "${serverData.name}"` });
    res.json(serverData);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const updateOwner = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") {
    return res.status(403).json({ error: "Only admins can update owner" });
  }

  const { id } = req.params;
  const { owner } = req.body;

  if (!owner) return res.status(400).json({ error: "Owner required" });

  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);

  if (!server) return res.status(404).json({ error: "Server not found" });

  server.owner = owner;
  await writeJSON("servers.json", servers);
  
  res.json({ success: true });
};

export const updateIpAlias = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { ipAlias } = req.body;

  const servers = await readJSON("servers.json") || [];
  const server = servers.find((s: any) => s.id === id);

  if (!server) return res.status(404).json({ error: "Server not found" });

  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  server.ipAlias = ipAlias;
  await writeJSON("servers.json", servers);
  
  res.json({ success: true });
};

export const deleteServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    
    let servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    if (user.role !== "admin" && user.role !== "owner") {
      return res.status(403).json({ error: "Only admins can delete servers" });
    }

    if (server.containerId) {
      await deleteContainer(server.containerId);
    }
    
    servers = servers.filter((s: any) => s.id !== id);
    await writeJSON("servers.json", servers);

    // Free up the node allocation (if any) this server was using.
    try {
      const allocations = await readJSON("allocations.json") || [];
      const alloc = allocations.find((a: any) => a.nodeId === server.nodeId && a.port === Number(server.port));
      if (alloc) {
        alloc.assigned = false;
        await writeJSON("allocations.json", allocations);
      }
    } catch (e) {
      console.error("Failed to release node allocation:", e);
    }

    // Remove files
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    try {
      await fs.remove(serverDir);
    } catch (e) {
      console.error("Failed to remove server directory", e);
    }
    
    await deleteSftpUser(id).catch(e => console.error("SFTP user deletion failed:", e));

    logActivity({ ...requestActor(req), serverId: id, serverName: server.name, action: "server.delete", description: `Deleted server "${server.name}"` });

    res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const startServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    
    const server = servers.find((s) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    if (server.suspended) {
      return res.status(403).json({ error: "Server is suspended" });
    }

    try {
      const io = req.app.get("io");
      if (io) io.to(`server_${id}`).emit("clear_logs");
      
      await startContainer(server.containerId);
    } catch (startErr: any) {
      if (startErr.statusCode === 404 || (startErr.message && startErr.message.toLowerCase().includes("no such container"))) {
        console.log(`Container missing for server ${server.id}. Recreating...`);
        let egg: any = null;
        if (server.eggId) {
          const eggs = await readJSON("eggs.json") || [];
          egg = eggs.find((e: any) => e.id === server.eggId);
        }
        server.containerId = await createServerContainer(server, egg);
        await writeJSON("servers.json", servers);
        await startContainer(server.containerId);
      } else {
        throw startErr;
      }
    }
    await attachContainerSocket(server.containerId, server.id);
    logActivity({ ...requestActor(req), serverId: server.id, serverName: server.name, action: "server.start", description: `Started server "${server.name}"` });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Start server error:", err);
    res.status(500).json({ error: err.message || "Failed to start server" });
  }
};

export const stopServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      await stopContainer(server.containerId);
    } catch (stopErr: any) {
      if (stopErr.statusCode === 404 || (stopErr.message && stopErr.message.toLowerCase().includes("no such container"))) {
        console.log(`Container already missing for server ${server.id}. Assuming stopped.`);
      } else {
        throw stopErr;
      }
    }
    logActivity({ ...requestActor(req), serverId: server.id, serverName: server.name, action: "server.stop", description: `Stopped server "${server.name}"` });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Stop server error:", err);
    res.status(500).json({ error: err.message || "Failed to stop server" });
  }
};

export const terminateServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (user.role !== "admin" && user.role !== "owner") {
      return res.status(403).json({ error: "Only admins can terminate servers" });
    }

    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }

    await killContainer(server.containerId);

    const io = req.app.get("io");
    if (io) io.to(`server_${id}`).emit("log", `[System] Server was forcefully terminated by an admin.\r\n`);

    logActivity({ ...requestActor(req), serverId: server.id, serverName: server.name, action: "server.terminate", description: `Forcefully terminated server "${server.name}"` });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Terminate server error:", err);
    res.status(500).json({ error: err.message || "Failed to terminate server" });
  }
};

export const restartServer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const io = req.app.get("io");
      if (io) io.to(`server_${id}`).emit("clear_logs");

      await restartContainer(server.containerId);
    } catch (startErr: any) {
      if (startErr.statusCode === 404 || (startErr.message && startErr.message.toLowerCase().includes("no such container"))) {
        console.log(`Container missing for server ${server.id}. Recreating...`);
        let egg: any = null;
        if (server.eggId) {
          const eggs = await readJSON("eggs.json") || [];
          egg = eggs.find((e: any) => e.id === server.eggId);
        }
        server.containerId = await createServerContainer(server, egg);
        await writeJSON("servers.json", servers);
        await startContainer(server.containerId);
      } else {
        throw startErr;
      }
    }
    await attachContainerSocket(server.containerId, server.id);
    logActivity({ ...requestActor(req), serverId: server.id, serverName: server.name, action: "server.restart", description: `Restarted server "${server.name}"` });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Restart server error:", err);
    res.status(500).json({ error: err.message || "Failed to restart server" });
  }
};

export const sendCommand = async (req: Request, res: Response) => {
  
  try {
    const { id } = req.params;
    const { command } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server || !server.containerId) {
      return res.status(404).json({ error: "Not found" });
    }
    await sendContainerCommand(server.containerId, command);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Command error:", err);
    res.status(500).json({ error: err.message || "Failed to send command" });
  }
};

// Runs an RCON command and returns its output — used by extensions (and
// the players list below) that need to show a result, not just fire a
// one-way command like sendCommand does.
export const runRcon = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "Missing command" });

    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!server.containerId) return res.status(400).json({ error: "Server has no container" });

    const output = await execRconCommand(server.containerId, command);
    res.json({ output });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to run RCON command" });
  }
};

// Parses "There are 2 of a max of 20 players online: Alice, Bob" into a
// clean player list for the Players tab.
export const getPlayers = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!server.containerId || server.status !== "online") {
      return res.json({ players: [] });
    }

    const output = await execRconCommand(server.containerId, "list");
    const colonIndex = output.indexOf(":");
    const namesPart = colonIndex !== -1 ? output.slice(colonIndex + 1) : "";
    const players = namesPart
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name }));

    res.json({ players });
  } catch (err: any) {
    res.status(200).json({ players: [], error: err.message });
  }
};

// Downloads a file (plugin jar, mod, config, etc.) into a server's data
// directory — used by extensions' "download_install" sections. Admin-only
// since it's an arbitrary URL fetch onto the host filesystem.
export const installExtensionItem = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== "admin" && user.role !== "owner") {
      return res.status(403).json({ error: "Admin access only" });
    }

    const { id } = req.params;
    let { url, targetDir, filename, modrinthProject } = req.body;
    const axios = (await import("axios")).default;

    // Resolve a Modrinth project slug to its latest version's primary
    // file, instead of requiring a hardcoded (and eventually stale) URL.
    if (!url && modrinthProject) {
      const verRes = await axios.get(`https://api.modrinth.com/v2/project/${modrinthProject}/version`);
      const latest = verRes.data?.[0];
      const file = latest?.files?.find((f: any) => f.primary) || latest?.files?.[0];
      if (!file) return res.status(404).json({ error: `No downloadable file found for Modrinth project "${modrinthProject}"` });
      url = file.url;
      filename = filename || file.filename;
    }

    if (!url || !filename) return res.status(400).json({ error: "Missing url/modrinthProject or filename" });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Only http/https URLs are allowed" });

    const safeDir = String(targetDir || "plugins").replace(/[^a-zA-Z0-9_-]/g, "");
    const safeFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!/\.(jar|zip|mrpack)$/i.test(safeFilename)) {
      return res.status(400).json({ error: "Only .jar, .zip, or .mrpack files are allowed" });
    }

    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const destDir = path.join(serverDir, safeDir);
    await fs.ensureDir(destDir);
    const destPath = path.join(destDir, safeFilename);

    const response = await axios({ url, method: "GET", responseType: "stream", maxContentLength: 500 * 1024 * 1024 });
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    await new Promise<void>((resolve, reject) => { writer.on("finish", resolve); writer.on("error", reject); });

    res.json({ success: true, path: `${safeDir}/${safeFilename}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to install file" });
  }
};

// Sends a test vote via the NuVotifier V2 protocol to verify a vote
// listener is reachable/configured correctly. host/port/token are
// whatever the admin/owner types in (usually this server's own votifier
// port, but could be any target) — not read from the server's container.
export const testVotifier = async (req: Request, res: Response) => {
  try {
    const { host, port, token, serviceName, username } = req.body;
    if (!host || !port || !token) {
      return res.status(400).json({ error: "host, port, and token are required" });
    }
    const { sendTestVote } = await import("../services/votifier.js");
    const result = await sendTestVote({ host, port: Number(port), token, serviceName, username });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send test vote" });
  }
};

export const changeServerVersion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { version, type, wipeData, eggId } = req.body;
    const user = (req as any).user;
    
    if (!version) return res.status(400).json({ error: "Version is required" });
    
    let servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Only admins or owners can change version" });
    }

    if (server.containerId) {
      const status = await getContainerStatus(server.containerId);
      if (status?.State?.Running) {
        return res.status(400).json({ error: "Server must be stopped before changing version. Please stop the server first." });
      }
      // Delete old container
      await deleteContainer(server.containerId);
    }
    
    const serverDir = path.join(process.cwd(), ".data", "servers", id);

    if (wipeData) {
      // Full wipe requested: clear out the entire server data directory
      // (world, plugins, mods, config — everything) before reinstalling.
      try {
        await fs.emptyDir(serverDir);
      } catch (e) {
        console.error("Failed to wipe server data", e);
      }
    } else {
      // Keep existing data, but automatically delete config files that are
      // known to cause issues when switching versions/software types.
      const filesToDelete = [
        "paper-global.yml", "paper-world-defaults.yml", "paper.yml",
        "config/paper-global.yml", "config/paper-world-defaults.yml",
        "world/data/random_sequences.dat"
      ];

      for (const file of filesToDelete) {
        const filePath = path.join(serverDir, file);
        try {
          if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
          }
        } catch (e) {
          console.error(`Failed to delete ${file}`, e);
        }
      }
    }
    
    // Look up the selected egg (server software), if the request came from
    // the Versions tab / egg system rather than the legacy type dropdown.
    let egg: any = null;
    if (eggId) {
      const eggs = await readJSON("eggs.json") || [];
      egg = eggs.find((e: any) => e.id === eggId);
    }

    server.version = version;
    if (egg) {
      server.eggId = egg.id;
      server.eggName = egg.name;
      server.category = egg.category;
      server.type = type || egg.name;
    } else if (type) {
      server.type = type;
    }
    // Recreate container with new version env. A version change means the
    // egg's installation script (if any) needs to run again to fetch the
    // newly-selected version's server software.
    server.installed = false;
    const newContainerId = await createServerContainer(server, egg);
    server.containerId = newContainerId;
    
    await writeJSON("servers.json", servers);
    
    res.json({ success: true, version, type: server.type, wiped: !!wipeData });
  } catch (err: any) {
    console.error("Change version error", err);
    res.status(500).json({ error: err.message });
  }
};

// Renders an egg's startup template by substituting {{VARIABLE}} tokens
// with the current value (server override, falling back to the egg's
// defaultValue, falling back to an empty string).
function renderStartup(template: string, values: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) => {
    return values[key] !== undefined ? String(values[key]) : "";
  });
}

// Returns the server's rendered startup command plus every variable the
// egg exposes (with the server's current override applied), so the
// Startup tab can show exactly what the egg makes available.
export const getStartup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });

    let egg: any = null;
    if (server.eggId) {
      const eggs = await readJSON("eggs.json") || [];
      egg = eggs.find((e: any) => e.id === server.eggId);
    }

    const eggVariables = Array.isArray(egg?.variables) ? egg.variables : [];
    const overrides = server.variables && typeof server.variables === "object" ? server.variables : {};

    const values: Record<string, string> = {};
    for (const v of eggVariables) {
      values[v.envVariable] = overrides[v.envVariable] !== undefined ? String(overrides[v.envVariable]) : String(v.defaultValue ?? "");
    }

    const variables = eggVariables.map((v: any) => ({
      name: v.name,
      envVariable: v.envVariable,
      description: v.description || "",
      defaultValue: v.defaultValue ?? "",
      editable: !!v.editable,
      value: values[v.envVariable] ?? "",
    }));

    res.json({
      eggName: egg?.name || server.eggName || server.type || "",
      startup: egg?.startup ? renderStartup(egg.startup, values) : "",
      raw: egg?.startup || "",
      variables,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Saves user-editable variable overrides for a server. Non-editable
// variables are silently ignored so users can't change locked settings
// (e.g. TYPE, EULA) through this endpoint. Changes take effect the next
// time the server's container is (re)created — start/restart alone
// doesn't recreate the container, so this only updates the stored value.
export const updateStartup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;
    const user = (req as any).user;

    if (!variables || typeof variables !== "object") {
      return res.status(400).json({ error: "variables object is required" });
    }

    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Only admins or owners can edit startup variables" });
    }

    let egg: any = null;
    if (server.eggId) {
      const eggs = await readJSON("eggs.json") || [];
      egg = eggs.find((e: any) => e.id === server.eggId);
    }
    const eggVariables = Array.isArray(egg?.variables) ? egg.variables : [];
    const editableKeys = new Set(eggVariables.filter((v: any) => v.editable).map((v: any) => v.envVariable));

    if (!server.variables) server.variables = {};
    for (const [key, value] of Object.entries(variables)) {
      if (editableKeys.has(key)) {
        server.variables[key] = String(value);
      }
    }

    await writeJSON("servers.json", servers);
    res.json({ success: true, variables: server.variables });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// File manager basics
export const getFiles = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.query.path ? String(req.query.path) : "/";
  const targetPath = path.join(process.cwd(), ".data", "servers", id, dirPath);
  
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats) {
      // Return empty if not found
      return res.json([]);
    }
    if (stats.isFile()) {
       const ext = path.extname(targetPath).toLowerCase();
       const imageExts: Record<string, string> = {
         ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
         ".ico": "image/x-icon", ".svg": "image/svg+xml",
       };
       if (imageExts[ext]) {
         const buf = await fs.readFile(targetPath);
         return res.json({ isFile: true, isImage: true, mimeType: imageExts[ext], content: buf.toString("base64") });
       }

       const HARD_LIMIT_BYTES = 15 * 1024 * 1024 * 1024; // 15GB — above this we truly refuse (browser/Node can't hold more as a string)
       const FULL_PREVIEW_BYTES = 25 * 1024 * 1024; // 25MB — above this, show a truncated tail instead of the whole file
       if (stats.size > HARD_LIMIT_BYTES) {
         return res.json({ isFile: true, isBinary: true, tooLarge: true, size: stats.size });
       }

       // Content-sniff rather than trust the extension: read a chunk and
       // look for a NUL byte, which essentially never appears in real
       // text files but is common in binaries (jars, executables,
       // archives, images without a recognized extension, etc). This is
       // the same heuristic git/most editors use for "is this binary".
       // NOTE: fs-extra's fs.open() resolves to a raw numeric fd (not a
       // FileHandle), so it has no .read()/.close() methods — use
       // fs/promises' open() here instead, which returns a real FileHandle.
       const sampleSize = Math.min(stats.size, 8000);
       const sampleBuf = Buffer.alloc(sampleSize);
       const fd = await openFileHandle(targetPath, "r");
       try {
         await fd.read(sampleBuf, 0, sampleSize, 0);
       } finally {
         await fd.close();
       }
       const isBinary = sampleBuf.includes(0);

       if (isBinary) {
         // Don't just refuse — give the panel enough bytes to render a
         // read-only hex view, like a real file manager would. Cap the
         // preview so we're never shipping a multi-GB blob to a browser
         // tab; Download (already available from the ⋮ menu) covers the
         // rest of the file.
         const HEX_PREVIEW_BYTES = 256 * 1024; // 256KB — enough to inspect headers/structure without choking the tab
         const previewSize = Math.min(stats.size, HEX_PREVIEW_BYTES);
         const previewBuf = Buffer.alloc(previewSize);
         const hexFd = await openFileHandle(targetPath, "r");
         try {
           await hexFd.read(previewBuf, 0, previewSize, 0);
         } finally {
           await hexFd.close();
         }
         return res.json({
           isFile: true,
           isBinary: true,
           size: stats.size,
           hexPreview: previewBuf.toString("base64"),
           hexTruncated: stats.size > HEX_PREVIEW_BYTES,
         });
       }

       if (stats.size > FULL_PREVIEW_BYTES) {
         // Read only the last chunk — for logs and similar append-only
         // files this is almost always the part someone actually wants
         // to see, and it avoids loading gigabytes into a browser tab.
         // The file still "opens" (just truncated) all the way up to
         // HARD_LIMIT_BYTES above.
         const tailSize = FULL_PREVIEW_BYTES;
         const tailBuf = Buffer.alloc(tailSize);
         const tailFd = await openFileHandle(targetPath, "r");
         try {
           await tailFd.read(tailBuf, 0, tailSize, stats.size - tailSize);
         } finally {
           await tailFd.close();
         }
         return res.json({
           isFile: true,
           content: tailBuf.toString("utf-8"),
           truncated: true,
           size: stats.size,
         });
       }

       const content = await fs.readFile(targetPath, "utf-8");
       return res.json({ isFile: true, content });
    }
    const files = await fs.readdir(targetPath, { withFileTypes: true });
    res.json(files.map(f => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      size: f.isDirectory() ? 0 : fs.statSync(path.join(targetPath, f.name)).size
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dirPath = req.body.path || "/";
  const targetPath = path.join(process.cwd(), ".data", "servers", id, dirPath);
  
  if (req.file) {
    await fs.ensureDir(targetPath);
    await fs.move(req.file.path, path.join(targetPath, req.file.originalname), { overwrite: true });
  }
  res.json({ success: true });
};

// ---- Chunked file upload (merged from Jtg panel) ----
// Lets the frontend upload large files in resumable 10MB chunks instead of
// one single request, with live per-chunk progress reporting.
export const uploadChunk = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { uploadId, chunkIndex, fileName, path: dirPath } = req.body;

  if (!req.file || !uploadId || chunkIndex === undefined || !fileName) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const targetPath = path.join(process.cwd(), ".data", "servers", id, dirPath || "/");
  const partFilePath = path.join(targetPath, fileName + ".part");

  if (!partFilePath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.ensureDir(targetPath);

    // If it's the first chunk, ensure we start fresh
    if (String(chunkIndex) === "0") {
      if (fs.existsSync(partFilePath)) {
        await fs.remove(partFilePath);
      }
    }

    // Read the uploaded chunk and append it
    const chunkData = await fs.readFile(req.file.path);
    await fs.appendFile(partFilePath, chunkData);

    // Cleanup multer temp file
    await fs.remove(req.file.path).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const completeUpload = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { uploadId, fileName, path: dirPath, totalChunks } = req.body;
  if (!uploadId || !fileName || !totalChunks) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const targetPath = path.join(process.cwd(), ".data", "servers", id, dirPath || "/");
  const finalFilePath = path.join(targetPath, fileName);
  const partFilePath = path.join(targetPath, fileName + ".part");

  if (!finalFilePath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    if (fs.existsSync(partFilePath)) {
      await fs.move(partFilePath, finalFilePath, { overwrite: true });
    } else {
      throw new Error("Part file missing");
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const filePaths = req.body.paths || (req.body.path ? [req.body.path] : []);
  
  try {
    for (const filePath of filePaths) {
      const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
      
      if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
        return res.status(403).json({ error: "Invalid path" });
      }
      
      await fs.remove(targetPath);
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const downloadFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const filePath = req.query.path ? String(req.query.path) : "";
  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);

  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats || !stats.isFile()) {
      return res.status(404).json({ error: "File not found" });
    }
    res.download(targetPath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const zipFiles = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { dirPath, fileNames, outputName } = req.body;
  
  const baseDir = path.join(process.cwd(), ".data", "servers", id, dirPath);
  const outZipPath = path.join(baseDir, outputName || "archive.zip");

  if (!baseDir.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    const output = fs.createWriteStream(outZipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      res.json({ success: true, filename: outputName || "archive.zip" });
    });

    archive.on("error", (err: any) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(output);

    for (const name of fileNames) {
      const filePath = path.join(baseDir, name);
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        archive.directory(filePath, name);
      } else {
        archive.file(filePath, { name });
      }
    }

    await archive.finalize();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

export const renameFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { oldPath, newPath } = req.body;

  const targetOldPath = path.join(process.cwd(), ".data", "servers", id, oldPath);
  const targetNewPath = path.join(process.cwd(), ".data", "servers", id, newPath);

  if (!targetOldPath.startsWith(path.join(process.cwd(), ".data", "servers", id)) ||
      !targetNewPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.rename(targetOldPath, targetNewPath);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export const unzipFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { path: filePath } = req.body;

  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
  
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  const destDir = path.dirname(targetPath);
  const ext = path.extname(targetPath).toLowerCase();

  try {
    if (ext === ".rar") {
      // No pure-JS RAR reader is bundled, so shell out to whichever
      // extractor is available on the host (install.sh installs both
      // unrar and p7zip so one of these should always work).
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      try {
        await execAsync(`unrar x -o+ ${JSON.stringify(targetPath)} ${JSON.stringify(destDir + path.sep)}`);
      } catch (unrarErr) {
        try {
          await execAsync(`7z x -y ${JSON.stringify(targetPath)} -o${JSON.stringify(destDir)}`);
        } catch (sevenZipErr: any) {
          throw new Error("Could not extract .rar — neither 'unrar' nor '7z' is installed on the server. Re-run install.sh to install them, or install manually: apt-get install unrar p7zip-full");
        }
      }
    } else {
      // .zip and other extract-zip-supported formats
      await extract(targetPath, { dir: destDir });
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};


export const createFile = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath } = req.body;
  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }
  try {
    await fs.writeFile(targetPath, "", "utf-8");
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createDirectory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath } = req.body;
  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);
  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }
  try {
    await fs.mkdir(targetPath, { recursive: true });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const saveFileContent = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath, content } = req.body;

  const targetPath = path.join(process.cwd(), ".data", "servers", id, filePath);

  if (!targetPath.startsWith(path.join(process.cwd(), ".data", "servers", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.writeFile(targetPath, content, "utf-8");
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export const getBackups = async (req: Request, res: Response) => {
  const { id } = req.params;
  const backupsDir = path.join(process.cwd(), ".data", "backups", id);
  await fs.ensureDir(backupsDir);

  try {
    const files = await fs.readdir(backupsDir);
    const backups = [];
    for (const file of files) {
      if (file.endsWith(".zip")) {
        const stats = await fs.stat(path.join(backupsDir, file));
        backups.push({
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime,
        });
      }
    }
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(backups);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createBackup = async (req: Request, res: Response) => {
  const { id } = req.params;
  const serverDir = path.join(process.cwd(), ".data", "servers", id);
  const backupsDir = path.join(process.cwd(), ".data", "backups", id);
  await fs.ensureDir(backupsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.zip`;
  const backupPath = path.join(backupsDir, filename);

  try {
    const serverExists = await fs.pathExists(serverDir);
    if (!serverExists) {
       await fs.ensureDir(serverDir); // ensure it acts properly if empty
    }

    const output = fs.createWriteStream(backupPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => {
      if (!res.headersSent) res.json({ success: true, filename });
    });

    archive.on("error", (err: any) => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(output);
    archive.directory(serverDir, false);
    await archive.finalize();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};

export const downloadBackup = async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const backupPath = path.join(process.cwd(), ".data", "backups", id, filename);

  // basic path traversal prevention
  if (!backupPath.startsWith(path.join(process.cwd(), ".data", "backups", id))) {
    return res.status(403).send("Invalid path");
  }

  if (await fs.pathExists(backupPath)) {
    res.download(backupPath);
  } else {
    res.status(404).send("Backup not found");
  }
};

export const deleteBackup = async (req: Request, res: Response) => {
  const { id, filename } = req.params;
  const backupPath = path.join(process.cwd(), ".data", "backups", id, filename);

  if (!backupPath.startsWith(path.join(process.cwd(), ".data", "backups", id))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  try {
    await fs.remove(backupPath);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
export const installPlugin = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { source, pluginId, pluginName } = req.body;
  
  // Allow direct downloadUrl fallback for backward compatibility
  if (req.body.downloadUrl) {
     try {
        const serverDir = path.join(process.cwd(), ".data", "servers", id);
        const pluginsDir = path.join(serverDir, "plugins");
        await fs.ensureDir(pluginsDir);
        const filePath = path.join(pluginsDir, req.body.filename);
        if (req.body.downloadUrl === 'dummy') {
          await fs.writeFile(filePath, '');
        } else {
          const axios = (await import("axios")).default;
          const response = await axios({ url: req.body.downloadUrl, method: 'GET', responseType: 'stream' });
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);
          await new Promise<void>((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
        }
        return res.json({ success: true, message: "Plugin installed successfully" });
     } catch(e) {
        return res.status(500).json({ error: "Failed to install plugin" });
     }
  }

  if (!source || !pluginId || !pluginName) {
    return res.status(400).json({ error: "Missing source, pluginId, or pluginName" });
  }

  try {
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const pluginsDir = path.join(serverDir, "plugins");
    await fs.ensureDir(pluginsDir);
    
    let downloadUrl = null;
    let filename = `${pluginName.replace(/[^a-zA-Z0-9]/g, '_')}.jar`;
    const axios = (await import("axios")).default;

    if (source === 'modrinth') {
      const verRes = await axios.get(`https://api.modrinth.com/v2/project/${pluginId}/version`);
      if (verRes.data && verRes.data.length > 0) {
        const file = verRes.data[0].files.find((f: any) => f.primary) || verRes.data[0].files[0];
        if (file) {
           downloadUrl = file.url;
           filename = file.filename || filename;
        }
      }
    } else if (source === 'spigot') {
       const apiRes = await axios.get(`https://api.spiget.org/v2/resources/${pluginId}`);
       if (apiRes.data && apiRes.data.file) {
         if (apiRes.data.file.type === 'external' && apiRes.data.file.externalUrl) {
           const extUrl = apiRes.data.file.externalUrl;
           if (extUrl.includes('github.com') && extUrl.includes('/releases/')) {
             // Try to extract github repo to get the jar
             const match = extUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/releases\/tag\/([^\/]+)/);
             if (match) {
               const owner = match[1];
               const repo = match[2];
               const tag = match[3];
               const ghRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);
               if (ghRes.data && ghRes.data.assets) {
                 const jarAsset = ghRes.data.assets.find((a: any) => a.name.endsWith('.jar'));
                 if (jarAsset) {
                   downloadUrl = jarAsset.browser_download_url;
                   filename = jarAsset.name;
                 }
               }
             } else {
               const matchLatest = extUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/releases\/latest/);
               if (matchLatest) {
                 const owner = matchLatest[1];
                 const repo = matchLatest[2];
                 const ghRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
                 if (ghRes.data && ghRes.data.assets) {
                   const jarAsset = ghRes.data.assets.find((a: any) => a.name.endsWith('.jar'));
                   if (jarAsset) {
                     downloadUrl = jarAsset.browser_download_url;
                     filename = jarAsset.name;
                   }
                 }
               }
             }
           }
           
           if (!downloadUrl) {
             return res.status(400).json({ error: "This plugin must be downloaded externally from: " + extUrl });
           }
         } else {
           downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;
         }
       } else {
         downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;
       }
    } else if (source === 'hangar') {
       const [owner, slug] = pluginId.split('/');
       const verRes = await axios.get(`https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions`);
       if (verRes.data && verRes.data.result && verRes.data.result.length > 0) {
         const version = verRes.data.result[0];
         const download = version.downloads.PAPER || Object.values(version.downloads)[0];
         if (download && (download as any).downloadUrl) {
            downloadUrl = (download as any).downloadUrl;
            if ((download as any).fileInfo && (download as any).fileInfo.name) {
                filename = (download as any).fileInfo.name;
            }
         } else if (download && (download as any).externalUrl) {
            return res.status(400).json({ error: "This plugin must be downloaded externally from: " + (download as any).externalUrl });
         }
       }
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not find a valid download URL for this plugin." });
    }

    const filePath = path.join(pluginsDir, filename);
    const response = await axios({
      url: downloadUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
         'User-Agent': 'React-Minecraft-Panel/1.0'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    res.json({ success: true, message: "Plugin installed successfully" });
  } catch (error: any) {
    console.error("Plugin installation failed:", error.message);
    res.status(500).json({ error: "Plugin installation failed: " + error.message });
  }
};

export const installMod = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { pluginId, pluginName } = req.body; 

  if (!pluginId || !pluginName) {
    return res.status(400).json({ error: "Missing pluginId or pluginName" });
  }

  try {
    const serverDir = path.join(process.cwd(), ".data", "servers", id);
    const modsDir = path.join(serverDir, "mods");
    await fs.ensureDir(modsDir);
    
    let downloadUrl = null;
    let filename = `${pluginName.replace(/[^a-zA-Z0-9]/g, '_')}.jar`;
    const axios = (await import("axios")).default;

    const verRes = await axios.get(`https://api.modrinth.com/v2/project/${pluginId}/version`);
    if (verRes.data && verRes.data.length > 0) {
      const file = verRes.data[0].files.find((f: any) => f.primary) || verRes.data[0].files[0];
      if (file) {
          downloadUrl = file.url;
          filename = file.filename || filename;
      }
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not find a valid download URL for this mod." });
    }

    const filePath = path.join(modsDir, filename);
    const response = await axios({
      url: downloadUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
         'User-Agent': 'React-Minecraft-Panel/1.0'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    res.json({ success: true, message: "Mod installed successfully" });
  } catch (error: any) {
    console.error("Mod installation failed:", error.message);
    res.status(500).json({ error: "Mod installation failed: " + error.message });
  }
};

export const updateResources = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ram, cpu, disk } = req.body;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if ((req as any).user.role !== "admin") return res.status(403).json({ error: "Unauthorized" });

    server.ram = Number(ram);
    server.cpu = Number(cpu);
    server.disk = Number(disk);

    // Recreate the container so the new limits actually take effect —
    // just stopping the old one (previous behavior) left it running with
    // its original limits baked in the next time it was started.
    let egg: any = null;
    if (server.eggId) {
      const eggs = await readJSON("eggs.json") || [];
      egg = eggs.find((e: any) => e.id === server.eggId);
    }
    if (server.containerId) {
      try { await deleteContainer(server.containerId); } catch (e) { console.error("Failed to remove old container", e); }
    }
    try {
      server.containerId = await createServerContainer(server, egg);
    } catch (e) {
      console.error("Failed to recreate container with new resource limits", e);
    }

    await writeJSON("servers.json", servers);
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to update resources" });
  }
};

export const updateSuspend = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { suspendDuration } = req.body; // permanent, 1_month, 2_months, 24_hours, 1_week, or null
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if ((req as any).user.role !== "admin") return res.status(403).json({ error: "Unauthorized" });

    server.suspended = suspendDuration !== null;
    server.suspendDuration = suspendDuration;
    await writeJSON("servers.json", servers);

    if (server.suspended && server.containerId) {
       try {
         await stopContainer(server.containerId);
       } catch(e) {}
    }

    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to suspend server" });
  }
};

// Sets or clears a server's auto-suspension date (see services/scheduler.ts,
// which checks this on an interval and suspends the server once it passes).
export const updateExpiration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { expirationDate } = req.body; // ISO date string, or null to clear
    if ((req as any).user.role !== "admin") return res.status(403).json({ error: "Unauthorized" });

    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });

    server.expirationDate = expirationDate || null;
    await writeJSON("servers.json", servers);
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: "Failed to update expiration date" });
  }
};

// ---------------------------------------------------------------------------
// Network (Pterodactyl-style per-server "Network" tab): the primary
// IP:Port this server is reachable on, plus which node it's provisioned on
// (or "Local Node" if it was created before nodes existed / no real node
// was picked).
// ---------------------------------------------------------------------------
export const getServerNetwork = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const servers = await readJSON("servers.json") || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const settings = await readJSON("settings.json") || {};
    let node: any = null;
    if (server.nodeId) {
      const nodes = await readJSON("nodes.json") || [];
      const n = nodes.find((nn: any) => nn.id === server.nodeId);
      if (n) node = { id: n.id, name: n.name, fqdn: n.fqdn, status: n.status };
    }

    res.json({
      ip: server.ipAlias || settings.nodeIp || null,
      port: server.port,
      ipAlias: server.ipAlias || null,
      node: node || { id: null, name: "Local Node", fqdn: null, status: "connected" },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load network info" });
  }
};
