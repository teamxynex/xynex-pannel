import { Request, Response, NextFunction } from "express";
import { getClientIp } from "./ipBan.js";

// Lightweight, in-memory per-IP request counter — no external dependency,
// no disk writes on the hot path. Used by the admin "Traffic" tab to spot
// which IPs are hammering the panel (a real flood shows up here within a
// minute) so an admin can ban the offending IP straight from the table.
//
// Counts reset every minute; the *previous* minute's snapshot is what's
// displayed (so the number shown is always a complete, stable "requests in
// the last minute" figure rather than a partial in-progress count).

let currentBucket: Map<string, number> = new Map();
let lastMinuteSnapshot: Map<string, number> = new Map();
const lifetimeTotals: Map<string, number> = new Map();
const firstSeen: Map<string, number> = new Map();
const lastSeen: Map<string, number> = new Map();

// Cap how many distinct IPs we'll track to avoid unbounded memory growth
// under a real distributed flood. Oldest-seen entries are evicted first.
const MAX_TRACKED_IPS = 5000;

export function trackTraffic(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    if (ip) {
      currentBucket.set(ip, (currentBucket.get(ip) || 0) + 1);
      lifetimeTotals.set(ip, (lifetimeTotals.get(ip) || 0) + 1);
      const now = Date.now();
      if (!firstSeen.has(ip)) {
        if (firstSeen.size >= MAX_TRACKED_IPS) {
          // Evict the oldest-seen IP to make room.
          let oldestIp: string | null = null;
          let oldestAt = Infinity;
          for (const [k, v] of firstSeen) {
            if (v < oldestAt) { oldestAt = v; oldestIp = k; }
          }
          if (oldestIp) {
            firstSeen.delete(oldestIp);
            lastSeen.delete(oldestIp);
            lifetimeTotals.delete(oldestIp);
            currentBucket.delete(oldestIp);
            lastMinuteSnapshot.delete(oldestIp);
          }
        }
        firstSeen.set(ip, now);
      }
      lastSeen.set(ip, now);
    }
  } catch (e) {
    // Never let traffic tracking break a real request.
  }
  next();
}

setInterval(() => {
  lastMinuteSnapshot = currentBucket;
  currentBucket = new Map();
}, 60_000).unref();

export type TrafficRow = {
  ip: string;
  requestsPerMinute: number;
  totalRequests: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

export function getTrafficSnapshot(limit = 50): TrafficRow[] {
  const ips = new Set<string>([...lastMinuteSnapshot.keys(), ...currentBucket.keys()]);
  const rows: TrafficRow[] = Array.from(ips).map((ip) => ({
    ip,
    // Use whichever is higher: the completed last-minute count, or the
    // in-progress current-minute count — so a fresh flood shows up
    // immediately instead of waiting up to 60s for the bucket to roll over.
    requestsPerMinute: Math.max(lastMinuteSnapshot.get(ip) || 0, currentBucket.get(ip) || 0),
    totalRequests: lifetimeTotals.get(ip) || 0,
    firstSeen: firstSeen.has(ip) ? new Date(firstSeen.get(ip)!).toISOString() : null,
    lastSeen: lastSeen.has(ip) ? new Date(lastSeen.get(ip)!).toISOString() : null,
  }));
  rows.sort((a, b) => b.requestsPerMinute - a.requestsPerMinute || b.totalRequests - a.totalRequests);
  return rows.slice(0, limit);
}

export function getTrackedIpCount(): number {
  return firstSeen.size;
}
