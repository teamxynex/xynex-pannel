import { Request, Response } from "express";
import { readJSON, writeJSON } from "../services/db.js";
import crypto from "crypto";

// An "extension" is a small declarative module an admin uploads to add
// a new tab to Minecraft servers, without writing any server-side code.
// Each `section` is rendered by a built-in renderer on the frontend:
//
//   { title, type: "rcon_output", command, refreshSeconds? }
//     -> runs an RCON command on an interval and displays the raw output
//        (e.g. `list` for online players).
//
//   { title, type: "rcon_buttons", buttons: [{ label, commandTemplate, inputPlaceholder? }] }
//     -> one button per entry; commandTemplate can use {input} which is
//        replaced with whatever the admin/owner typed before sending.
//
//   { title, type: "download_install", targetDir, items: [{ name, url }] }
//     -> "Install" button per item, downloads the file into
//        .data/servers/<id>/<targetDir>/<filename> (jar/zip/mrpack only).
//
// Example (a simple moderation + quick-plugin extension):
// {
//   "name": "Quick Moderation",
//   "description": "Common admin actions via RCON",
//   "appliesTo": "minecraft",
//   "sections": [
//     { "title": "Online Players", "type": "rcon_output", "command": "list", "refreshSeconds": 10 },
//     { "title": "Actions", "type": "rcon_buttons", "buttons": [
//         { "label": "Op Player", "commandTemplate": "op {input}", "inputPlaceholder": "username" },
//         { "label": "Kick Player", "commandTemplate": "kick {input}", "inputPlaceholder": "username" },
//         { "label": "Save World", "commandTemplate": "save-all" }
//     ]},
//     { "title": "Quick Plugins", "type": "download_install", "targetDir": "plugins", "items": [
//         { "name": "EssentialsX", "url": "https://.../EssentialsX.jar" }
//     ]}
//   ]
// }

const VALID_SECTION_TYPES = ["rcon_output", "rcon_buttons", "download_install", "votifier_test", "plugin_search"];

function validateExtensionShape(body: any): string {
  if (!body || typeof body !== "object") return "Extension must be a JSON object.";
  if (!body.name) return "Extension needs a 'name'.";
  if (!Array.isArray(body.sections) || body.sections.length === 0) {
    return "Extension needs at least one entry in 'sections'.";
  }
  for (const section of body.sections) {
    if (!section.title || !VALID_SECTION_TYPES.includes(section.type)) {
      return `Every section needs a 'title' and a valid 'type' (${VALID_SECTION_TYPES.join(", ")}).`;
    }
    if (section.type === "rcon_output" && !section.command) {
      return "rcon_output sections need a 'command'.";
    }
    if (section.type === "rcon_buttons" && (!Array.isArray(section.buttons) || section.buttons.length === 0)) {
      return "rcon_buttons sections need at least one entry in 'buttons'.";
    }
    if (section.type === "download_install") {
      if (!Array.isArray(section.items) || section.items.length === 0) {
        return "download_install sections need at least one entry in 'items'.";
      }
      for (const item of section.items) {
        if (!item.name || (!item.url && !item.modrinthProject)) {
          return "Every download_install item needs a 'name' and either a 'url' or a 'modrinthProject'.";
        }
      }
    }
  }
  return "";
}

// Seeded by default so they're already active without needing a manual
// upload — converts the "Votifier Tester" and "MC Plugins" Blueprint
// extensions' functionality into our own format. Kept as separate
// extensions/tabs rather than combined into one.
const DEFAULT_EXTENSIONS = [
  {
    id: "ext-votifier-tester",
    name: "Votifier Tester",
    description: "Send a test vote to check your vote listener is reachable and configured correctly.",
    appliesTo: "minecraft",
    enabled: true,
    builtin: true,
    sections: [
      {
        title: "Votifier Tester",
        type: "votifier_test",
      },
    ],
  },
  {
    id: "ext-plugin-manager",
    name: "Plugin Manager",
    description: "Search and install plugins from Modrinth, SpigotMC, and Paper Hangar.",
    appliesTo: "minecraft",
    enabled: true,
    builtin: true,
    sections: [
      {
        title: "Plugin Manager",
        type: "plugin_search",
      },
    ],
  },
];

// Older versions of this file seeded a single combined extension under
// this id — migrate installs that still have it to the two split ones.
const RETIRED_EXTENSION_IDS = ["ext-votifier-quickplugins"];

async function ensureExtensionsSeeded() {
  const existing = await readJSON("extensions.json");
  if (!existing || existing.length === 0) {
    await writeJSON("extensions.json", DEFAULT_EXTENSIONS);
    return DEFAULT_EXTENSIONS;
  }

  // Keep the built-in extensions' sections in sync with the latest
  // version of this code (so existing installs pick up improvements),
  // drop any retired ones, and add any new defaults that are missing —
  // while preserving whatever enabled/disabled state the admin set.
  let changed = false;
  let updated = existing
    .filter((ext: any) => {
      if (RETIRED_EXTENSION_IDS.includes(ext.id)) { changed = true; return false; }
      return true;
    })
    .map((ext: any) => {
      const latest = DEFAULT_EXTENSIONS.find((d) => d.id === ext.id);
      if (latest && JSON.stringify(latest.sections) !== JSON.stringify(ext.sections)) {
        changed = true;
        return { ...ext, sections: latest.sections, description: latest.description };
      }
      return ext;
    });
  const missingDefaults = DEFAULT_EXTENSIONS.filter((d) => !updated.some((e: any) => e.id === d.id));
  if (missingDefaults.length > 0) changed = true;

  const result = [...updated, ...missingDefaults];
  if (changed) await writeJSON("extensions.json", result);
  return result;
}

export const getExtensions = async (req: Request, res: Response) => {
  const extensions = await ensureExtensionsSeeded();
  res.json(extensions);
};

export const createExtension = async (req: Request, res: Response) => {
  const error = validateExtensionShape(req.body);
  if (error) return res.status(400).json({ error });

  const { name, description, appliesTo, sections } = req.body;
  const extension = {
    id: "ext-" + crypto.randomUUID(),
    name: String(name),
    description: description ? String(description) : "",
    appliesTo: appliesTo === "all" ? "all" : "minecraft",
    enabled: true,
    sections,
  };

  const extensions = await readJSON("extensions.json") || [];
  extensions.push(extension);
  await writeJSON("extensions.json", extensions);
  res.json({ success: true, extension });
};

export const toggleExtension = async (req: Request, res: Response) => {
  const extensions = await readJSON("extensions.json") || [];
  const extension = extensions.find((e: any) => e.id === req.params.id);
  if (!extension) return res.status(404).json({ error: "Extension not found" });
  extension.enabled = !extension.enabled;
  await writeJSON("extensions.json", extensions);
  res.json({ success: true, extension });
};

export const deleteExtension = async (req: Request, res: Response) => {
  const extensions = await readJSON("extensions.json") || [];
  const target = extensions.find((e: any) => e.id === req.params.id);
  if (target?.builtin) {
    return res.status(400).json({ error: "This built-in extension can't be deleted (you can disable it instead)." });
  }
  const filtered = extensions.filter((e: any) => e.id !== req.params.id);
  await writeJSON("extensions.json", filtered);
  res.json({ success: true });
};
