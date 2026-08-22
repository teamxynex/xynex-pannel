import { Request, Response } from "express";
import { readJSON } from "../services/db.js";

// Admin-wide activity feed (every server, every user). Supports simple
// pagination via ?limit=&before= (ISO timestamp cursor).
export const getAllActivity = async (req: Request, res: Response) => {
  try {
    const entries = (await readJSON("activity.json")) || [];
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const before = req.query.before ? new Date(String(req.query.before)) : null;

    let filtered = entries;
    if (before && !isNaN(before.getTime())) {
      filtered = entries.filter((e: any) => new Date(e.timestamp) < before);
    }
    res.json(filtered.slice(0, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load activity log" });
  }
};

// Per-server activity feed — the server route already enforces ownership
// before this runs (see routes/servers.ts).
export const getServerActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entries = (await readJSON("activity.json")) || [];
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filtered = entries.filter((e: any) => e.serverId === id);
    res.json(filtered.slice(0, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load server activity" });
  }
};
