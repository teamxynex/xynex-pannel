import crypto from "crypto";
import { readJSON, writeJSON } from "./db.js";

// Simple JSON-backed audit trail (Pterodactyl-style "Activity Log").
// Capped at MAX_ENTRIES, oldest entries drop off first.

const MAX_ENTRIES = 2000;

export interface ActivityEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  username: string;
  serverId: string | null;
  serverName: string | null;
  action: string;
  description: string;
  ip: string | null;
}

export async function logActivity(entry: {
  userId?: string | null;
  username?: string;
  serverId?: string | null;
  serverName?: string | null;
  action: string;
  description: string;
  ip?: string | null;
}) {
  try {
    const entries: ActivityEntry[] = (await readJSON("activity.json")) || [];
    entries.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: entry.userId ?? null,
      username: entry.username || "system",
      serverId: entry.serverId ?? null,
      serverName: entry.serverName ?? null,
      action: entry.action,
      description: entry.description,
      ip: entry.ip ?? null,
    });
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    await writeJSON("activity.json", entries);
  } catch (e) {
    console.error("[activity-log] failed to write entry:", e);
  }
}

// Pulls the request's user + best-effort IP so call sites don't repeat this.
export function requestActor(req: any) {
  const user = req.user || {};
  const ip =
    (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  return { userId: user.id || null, username: user.username || user.email || "unknown", ip };
}
