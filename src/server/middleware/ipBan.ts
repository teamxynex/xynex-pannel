import { Request, Response, NextFunction } from "express";
import { readJSON, writeJSON } from "../services/db.js";

// Best-effort client IP resolution. Trusts X-Forwarded-For's first hop
// (works behind Cloudflare Tunnel / a reverse proxy) and falls back to the
// raw socket address otherwise. Normalizes IPv4-mapped IPv6 addresses
// (::ffff:1.2.3.4) so bans match consistently.
export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  let ip = "";
  if (typeof fwd === "string" && fwd.length > 0) {
    ip = fwd.split(",")[0].trim();
  } else if (Array.isArray(fwd) && fwd.length > 0) {
    ip = fwd[0].trim();
  } else {
    ip = req.socket?.remoteAddress || "";
  }
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

export type BannedIpEntry = {
  ip: string;
  reason?: string;
  bannedBy?: string;
  bannedAt: string;
};

export async function listBannedIps(): Promise<BannedIpEntry[]> {
  return (await readJSON("banned_ips.json")) || [];
}

export async function isIpBanned(ip: string): Promise<boolean> {
  if (!ip) return false;
  const banned = await listBannedIps();
  return banned.some((b) => b.ip === ip);
}

export async function banIp(ip: string, reason?: string, bannedBy?: string): Promise<void> {
  if (!ip) return;
  const banned = await listBannedIps();
  if (banned.some((b) => b.ip === ip)) return;
  banned.push({ ip, reason: reason || "", bannedBy: bannedBy || "", bannedAt: new Date().toISOString() });
  await writeJSON("banned_ips.json", banned);
}

export async function unbanIp(ip: string): Promise<void> {
  const banned = await listBannedIps();
  await writeJSON("banned_ips.json", banned.filter((b) => b.ip !== ip));
}

// Applied globally, early in the middleware chain, so a banned IP is
// rejected before it can even attempt a login or burn rate-limit quota.
export async function checkIpBanMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = getClientIp(req);
    if (ip && (await isIpBanned(ip))) {
      res.status(403).json({ error: "Your IP address has been banned from accessing this panel." });
      return;
    }
    next();
  } catch (err) {
    // Fail open: a bug in the ban-check itself should never take the whole panel down.
    next();
  }
}
