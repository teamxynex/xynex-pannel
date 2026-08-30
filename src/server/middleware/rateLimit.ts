import rateLimit from "express-rate-limit";

// Strict limiter for authentication-sensitive routes (login, register, 2FA
// verification). Keyed by IP address to slow down brute-force / credential
// stuffing attempts against a single account or across many accounts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
  skipSuccessfulRequests: true, // don't penalize users for their eventual successful login
});

// Slightly looser limiter for the captcha challenge/verify endpoints -
// legitimate users may need a handful of tries (or hit "refresh") before
// solving one, but this still keeps it from being hammered to enumerate
// challenges or brute-force answers.
export const captchaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

// Looser limiter applied to the whole /api surface as a general safety net
// against abusive clients/bots. High enough to not interfere with normal
// dashboard polling (server stats, console logs, etc.), which happens every
// 5-10 seconds per open tab.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
