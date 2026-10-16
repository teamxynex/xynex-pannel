import { readJSON, writeJSON } from "./db.js";
import { startContainer, stopContainer, restartContainer, sendContainerCommand } from "./docker.js";
import { logActivity } from "./activityLog.js";

// Pterodactyl-style per-server "Schedules/Tasks": power actions or console
// commands that fire on a recurring interval. Storage is a flat
// schedules.json array; a single setInterval loop (see startTaskScheduler)
// checks for due entries every tick.

export interface Schedule {
  id: string;
  serverId: string;
  name: string;
  action: "start" | "stop" | "restart" | "command";
  command: string | null;
  interval: {
    type: "minutes" | "hourly" | "daily" | "weekly";
    value?: number; // for "minutes": run every N minutes
    hour?: number; // for "daily"/"weekly": 0-23
    minute?: number; // for "hourly"/"daily"/"weekly": 0-59
    dayOfWeek?: number; // for "weekly": 0 (Sun) - 6 (Sat)
  };
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt?: string;
}

export function computeNextRun(schedule: Schedule, from: Date = new Date()): Date {
  const next = new Date(from);
  const { type, value, hour, minute, dayOfWeek } = schedule.interval || ({} as any);

  if (type === "minutes") {
    const mins = Math.max(1, Number(value) || 5);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + mins);
    return next;
  }

  if (type === "hourly") {
    const m = Number(minute) || 0;
    next.setSeconds(0, 0);
    next.setMinutes(m);
    if (next <= from) next.setHours(next.getHours() + 1);
    return next;
  }

  if (type === "daily") {
    const h = Number(hour) || 0;
    const m = Number(minute) || 0;
    next.setHours(h, m, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (type === "weekly") {
    const h = Number(hour) || 0;
    const m = Number(minute) || 0;
    const dow = dayOfWeek ?? 0;
    next.setHours(h, m, 0, 0);
    let diff = (dow - next.getDay() + 7) % 7;
    if (diff === 0 && next <= from) diff = 7;
    next.setDate(next.getDate() + diff);
    return next;
  }

  // Fallback: an hour from now, so a malformed interval doesn't loop instantly.
  next.setHours(next.getHours() + 1);
  return next;
}

async function executeAction(schedule: Schedule, server: any) {
  if (!server.containerId) throw new Error("Server has no container yet");
  switch (schedule.action) {
    case "start":
      return startContainer(server.containerId);
    case "stop":
      return stopContainer(server.containerId);
    case "restart":
      return restartContainer(server.containerId);
    case "command":
      return sendContainerCommand(server.containerId, schedule.command || "");
    default:
      throw new Error(`Unknown schedule action: ${schedule.action}`);
  }
}

export async function runScheduleNow(schedule: Schedule, server: any) {
  try {
    await executeAction(schedule, server);
    schedule.lastRunAt = new Date().toISOString();
    schedule.lastRunStatus = "success";
  } catch (err: any) {
    schedule.lastRunAt = new Date().toISOString();
    schedule.lastRunStatus = "failed: " + (err.message || String(err));
    logActivity({
      username: "scheduler",
      serverId: server.id,
      serverName: server.name,
      action: "schedule.run",
      description: `Schedule "${schedule.name}" failed: ${err.message || err}`,
    });
    throw err;
  }

  schedule.nextRunAt = computeNextRun(schedule).toISOString();

  const schedules = (await readJSON("schedules.json")) || [];
  const idx = schedules.findIndex((s: any) => s.id === schedule.id);
  if (idx !== -1) {
    schedules[idx] = schedule;
    await writeJSON("schedules.json", schedules);
  }

  logActivity({
    username: "scheduler",
    serverId: server.id,
    serverName: server.name,
    action: "schedule.run",
    description: `Schedule "${schedule.name}" ran (${schedule.action})`,
  });
}

async function tick() {
  try {
    const schedules: Schedule[] = (await readJSON("schedules.json")) || [];
    if (schedules.length === 0) return;
    const servers = (await readJSON("servers.json")) || [];
    const now = new Date();

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      if (!schedule.nextRunAt || new Date(schedule.nextRunAt) > now) continue;

      const server = servers.find((s: any) => s.id === schedule.serverId);
      if (!server || server.suspended) continue;

      try {
        await runScheduleNow(schedule, server);
      } catch (e) {
        console.error(`[task-scheduler] schedule "${schedule.name}" failed:`, e);
      }
    }
  } catch (e) {
    console.error("[task-scheduler] tick failed:", e);
  }
}

let started = false;

export function startTaskScheduler(intervalMs = 30 * 1000) {
  if (started) return;
  started = true;
  tick();
  setInterval(tick, intervalMs);
  console.log("[task-scheduler] started — checking every " + Math.round(intervalMs / 1000) + "s");
}
