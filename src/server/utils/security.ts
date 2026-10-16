import crypto from "crypto";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

/* ── JWT secret ─────────────────────────────────────────────────────────────
   Never fall back to a hardcoded/guessable secret. If JWT_SECRET isn't set in
   the environment, a strong random one is generated once and persisted in
   .data/jwt.secret (mode 0600) so sessions survive restarts. */
let cachedSecret: string | null = null;
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 16) {
    cachedSecret = envSecret;
    return cachedSecret;
  }
  const dataDir = path.join(process.cwd(), ".data");
  const file = path.join(dataDir, "jwt.secret");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, "utf8").trim();
      if (existing.length >= 32) { cachedSecret = existing; return cachedSecret; }
    }
    const generated = crypto.randomBytes(64).toString("hex");
    fs.writeFileSync(file, generated, { mode: 0o600 });
    cachedSecret = generated;
    console.warn("[SECURITY] JWT_SECRET not set (or too short) - generated a random one in .data/jwt.secret");
    return cachedSecret;
  } catch {
    // Last resort: random per-process secret (sessions reset on restart, but never guessable)
    cachedSecret = crypto.randomBytes(64).toString("hex");
    return cachedSecret;
  }
}

/** Verifies a *session* token only. Pre-auth (2FA stage) tokens, Discord OAuth
 *  state tokens, etc. share the same signing key but must never act as sessions. */
export function verifySessionToken(token: string): any {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as any;
  if (!decoded || typeof decoded !== "object" || decoded.stage || decoded.purpose || !decoded.id) {
    throw new Error("Not a session token");
  }
  return decoded;
}

/* ── Safe path resolution ───────────────────────────────────────────────────
   The old `target.startsWith(base)` check let "<base>-other" siblings through
   and ignored symlinks. This resolves inside `base` only, using path.relative
   plus a realpath check on the deepest existing ancestor. */
export function safeResolve(base: string, ...parts: string[]): string | null {
  const baseResolved = path.resolve(base);
  const target = path.resolve(baseResolved, ...parts.map((p) => String(p ?? "").replace(/^[/\\]+/, "")));
  const rel = path.relative(baseResolved, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (String(parts.join("")).includes("\0")) return null;

  // Symlink escape: resolve the deepest existing ancestor and re-check.
  try {
    let probe = target;
    while (!fs.existsSync(probe) && probe !== baseResolved) probe = path.dirname(probe);
    if (fs.existsSync(probe)) {
      const realProbe = fs.realpathSync(probe);
      const realBase = fs.existsSync(baseResolved) ? fs.realpathSync(baseResolved) : baseResolved;
      const relReal = path.relative(realBase, realProbe);
      if (relReal.startsWith("..") || path.isAbsolute(relReal)) return null;
    }
  } catch {
    return null;
  }
  return target;
}

export const SERVER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
export function isValidServerId(id: unknown): id is string {
  return typeof id === "string" && SERVER_ID_RE.test(id);
}

/** True only if `target` is `base` itself or strictly inside it (no sibling-prefix tricks,
 *  no `..`, and no symlink pointing outside of base). */
export function isInside(base: string, target: string): boolean {
  const b = path.resolve(base);
  const t = path.resolve(target);
  const rel = path.relative(b, t);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
  try {
    let probe = t;
    while (!fs.existsSync(probe) && probe !== b && probe !== path.dirname(probe)) probe = path.dirname(probe);
    if (fs.existsSync(probe) && fs.existsSync(b)) {
      const relReal = path.relative(fs.realpathSync(b), fs.realpathSync(probe));
      if (relReal.startsWith("..") || path.isAbsolute(relReal)) return false;
    }
  } catch {
    return false;
  }
  return true;
}

/* ── SSRF guard ─────────────────────────────────────────────────────────────
   Only allows http(s) URLs whose host resolves to a public address, so a user
   can't make the panel fetch internal services (127.0.0.1, 169.254.169.254
   cloud metadata, docker socket proxies, LAN hosts, ...). */
import dns from "dns/promises";
import net from "net";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  return true;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new Error("Credentials in URLs are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("URL points to a private or internal address");
  return u;
}
