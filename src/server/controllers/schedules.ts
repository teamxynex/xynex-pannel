import { Request, Response } from "express";
import crypto from "crypto";
import { readJSON, writeJSON } from "../services/db.js";
import { computeNextRun, runScheduleNow } from "../services/taskScheduler.js";
import { logActivity, requestActor } from "../services/activityLog.js";

function canManage(user: any, server: any) {
  return user.role === "admin" || user.role === "owner" || server.owner === user.id;
}

async function findOwnedServer(req: Request, res: Response) {
  const { id } = req.params;
  const user = (req as any).user;
  const servers = (await readJSON("servers.json")) || [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return null;
  }
  if (!canManage(user, server)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return server;
}

export const getSchedules = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  const schedules = (await readJSON("schedules.json")) || [];
  res.json(schedules.filter((s: any) => s.serverId === server.id));
};

export const createSchedule = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  const user = (req as any).user;

  const { name, action, command, interval } = req.body;
  if (!name || !action) {
    return res.status(400).json({ error: "name and action are required" });
  }
  if (!["start", "stop", "restart", "command"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }
  if (action === "command" && !command) {
    return res.status(400).json({ error: "command is required when action is 'command'" });
  }
  if (!interval || !interval.type) {
    return res.status(400).json({ error: "interval is required" });
  }

  const schedule: any = {
    id: crypto.randomUUID(),
    serverId: server.id,
    name,
    action,
    command: action === "command" ? command : null,
    interval, // { type: "minutes"|"hourly"|"daily"|"weekly", value?, hour?, minute?, dayOfWeek? }
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastRunStatus: null,
  };
  schedule.nextRunAt = computeNextRun(schedule).toISOString();

  const schedules = (await readJSON("schedules.json")) || [];
  schedules.push(schedule);
  await writeJSON("schedules.json", schedules);

  const actor = requestActor(req);
  logActivity({ ...actor, serverId: server.id, serverName: server.name, action: "schedule.create", description: `Created schedule "${name}" (${action})` });

  res.json(schedule);
};

export const updateSchedule = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  const { schedId } = req.params;
  const schedules = (await readJSON("schedules.json")) || [];
  const schedule = schedules.find((s: any) => s.id === schedId && s.serverId === server.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  const { name, action, command, interval, enabled } = req.body;
  if (name !== undefined) schedule.name = name;
  if (action !== undefined) schedule.action = action;
  if (command !== undefined) schedule.command = command;
  if (interval !== undefined) {
    schedule.interval = interval;
    schedule.nextRunAt = computeNextRun(schedule).toISOString();
  }
  if (enabled !== undefined) schedule.enabled = !!enabled;

  await writeJSON("schedules.json", schedules);
  res.json(schedule);
};

export const deleteSchedule = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  const { schedId } = req.params;
  const schedules = (await readJSON("schedules.json")) || [];
  const schedule = schedules.find((s: any) => s.id === schedId && s.serverId === server.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  await writeJSON("schedules.json", schedules.filter((s: any) => s.id !== schedId));

  const actor = requestActor(req);
  logActivity({ ...actor, serverId: server.id, serverName: server.name, action: "schedule.delete", description: `Deleted schedule "${schedule.name}"` });

  res.json({ success: true });
};

export const runScheduleNowHandler = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  const { schedId } = req.params;
  const schedules = (await readJSON("schedules.json")) || [];
  const schedule = schedules.find((s: any) => s.id === schedId && s.serverId === server.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  try {
    await runScheduleNow(schedule, server);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to run schedule" });
  }
};
