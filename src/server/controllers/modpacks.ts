import { Request, Response } from "express";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
import extract from "extract-zip";

const MODRINTH_API = "https://api.modrinth.com/v2";
const USER_AGENT = "XyneX-Panel/1.0 (modpack-installer)";

export const searchModpacks = async (req: Request, res: Response) => {
  try {
    const query = String(req.query.query || "");
    const facets = encodeURIComponent(JSON.stringify([["project_type:modpack"]]));
    const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&facets=${facets}&limit=24`;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Modrinth search failed (${response.status})`);
    const data: any = await response.json();
    const results = (data.hits || []).map((hit: any) => ({
      id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      author: hit.author,
      categories: hit.display_categories || hit.categories || [],
    }));
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to search modpacks" });
  }
};

export const getModpackVersions = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const response = await fetch(`${MODRINTH_API}/project/${projectId}/version`, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Modrinth version lookup failed (${response.status})`);
    const data: any = await response.json();
    const versions = data
      .filter((v: any) => (v.files || []).some((f: any) => f.filename.endsWith(".mrpack")))
      .map((v: any) => ({
        id: v.id,
        name: v.name,
        versionNumber: v.version_number,
        gameVersions: v.game_versions,
        loaders: v.loaders,
        datePublished: v.date_published,
      }));
    res.json({ versions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load modpack versions" });
  }
};

// Installs a Modrinth modpack (.mrpack) into a server's data directory.
// .mrpack is a zip containing modrinth.index.json (list of mod files to
// download, by hash-verified URL) plus an "overrides" folder of
// configs/resource packs to copy in directly.
export const installModpack = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { versionId } = req.body;
  if (!versionId) return res.status(400).json({ error: "versionId is required" });

  const serverDir = path.join(process.cwd(), ".data", "servers", id);
  const scratchDir = path.join(process.cwd(), ".data", "temp", `modpack-${crypto.randomUUID()}`);
  const logFile = path.join(process.cwd(), ".data", "install-logs", `${id}-modpack.log`);
  await fs.ensureDir(path.dirname(logFile));
  const log = async (line: string) => { await fs.appendFile(logFile, line + "\n").catch(() => {}); };

  try {
    await fs.ensureDir(scratchDir);
    await log(`--- Installing modpack version ${versionId} ---`);

    const versionRes = await fetch(`${MODRINTH_API}/version/${versionId}`, { headers: { "User-Agent": USER_AGENT } });
    if (!versionRes.ok) throw new Error(`Could not load version ${versionId} (${versionRes.status})`);
    const versionData: any = await versionRes.json();
    const mrpackFile = (versionData.files || []).find((f: any) => f.filename.endsWith(".mrpack"));
    if (!mrpackFile) throw new Error("This version has no .mrpack file available");

    const mrpackPath = path.join(scratchDir, "pack.mrpack");
    await log(`Downloading ${mrpackFile.filename}...`);
    const packRes = await fetch(mrpackFile.url);
    if (!packRes.ok) throw new Error(`Failed to download modpack file (${packRes.status})`);
    await fs.writeFile(mrpackPath, Buffer.from(await packRes.arrayBuffer()));

    const extractedDir = path.join(scratchDir, "extracted");
    await fs.ensureDir(extractedDir);
    await extract(mrpackPath, { dir: extractedDir });

    const index = await fs.readJson(path.join(extractedDir, "modrinth.index.json"));
    const files = index.files || [];
    await log(`Downloading ${files.length} mod file(s)...`);

    let done = 0;
    for (const file of files) {
      const downloadUrl = (file.downloads || [])[0];
      if (!downloadUrl) continue;
      const destPath = path.join(serverDir, file.path);
      if (!destPath.startsWith(serverDir)) continue; // guard against a malicious path in the index
      await fs.ensureDir(path.dirname(destPath));
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        await log(`  ! Failed to download ${file.path} (${fileRes.status}) — skipping`);
        continue;
      }
      await fs.writeFile(destPath, Buffer.from(await fileRes.arrayBuffer()));
      done++;
      if (done % 10 === 0) await log(`  ${done}/${files.length} downloaded...`);
    }
    await log(`Downloaded ${done}/${files.length} mod files.`);

    const overridesDir = path.join(extractedDir, "overrides");
    if (await fs.pathExists(overridesDir)) {
      await log("Copying overrides (configs/resource packs)...");
      await fs.copy(overridesDir, serverDir, { overwrite: true });
    }

    await fs.remove(scratchDir);
    await log("--- Modpack installation complete ---");

    res.json({
      success: true,
      installedFiles: done,
      dependencies: index.dependencies || {},
    });
  } catch (err: any) {
    await log(`--- Modpack installation FAILED: ${err.message} ---`);
    await fs.remove(scratchDir).catch(() => {});
    res.status(500).json({ error: err.message || "Failed to install modpack" });
  }
};

export const getModpackInstallLog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const logFile = path.join(process.cwd(), ".data", "install-logs", `${id}-modpack.log`);
    const content = await fs.readFile(logFile, "utf8").catch(() => "");
    res.json({ log: content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
