import crypto from "crypto";

// Simple "click the matching icon" captcha. A random target emoji is shown
// alongside a shuffled grid of options (one of which matches); the person
// just has to click the matching one - no typing required. This is meant to
// slow down generic credential-stuffing/login-spam scripts, not to defeat a
// bot custom-built to target this exact panel.
//
// Challenges are kept in memory (this panel runs as a single Node process).
// Each challenge is single-use: once verified it's marked consumed, and
// login must consume it too, so a solved challenge can't be replayed.

const ICON_POOL = [
  "⭐", "🔥", "💧", "🍀", "🌙", "☀️", "❤️", "💙", "💚", "🐱",
  "🐶", "🐰", "🦊", "🍎", "🍋", "🍇", "🎈", "⚽", "🎯", "🚀",
];

const CHALLENGE_TTL_MS = 3 * 60 * 1000; // 3 minutes to solve
const GRID_SIZE = 9;

type Challenge = {
  correctOptionId: string;
  expiresAt: number;
  verified: boolean;
  consumed: boolean;
};

const challenges = new Map<string, Challenge>();

// Periodic sweep so unsolved/expired challenges don't accumulate forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.expiresAt < now) challenges.delete(id);
  }
}, 60 * 1000).unref?.();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createChallenge() {
  const challengeId = crypto.randomBytes(16).toString("hex");
  const icons = shuffle(ICON_POOL).slice(0, GRID_SIZE);
  const target = icons[Math.floor(Math.random() * icons.length)];

  const options = shuffle(
    icons.map((emoji) => ({ id: crypto.randomBytes(6).toString("hex"), emoji }))
  );
  const correct = options.find((o) => o.emoji === target)!;

  challenges.set(challengeId, {
    correctOptionId: correct.id,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    verified: false,
    consumed: false,
  });

  return {
    challengeId,
    target,
    options: options.map((o) => ({ id: o.id, emoji: o.emoji })),
  };
}

export function verifyChallenge(challengeId: string, optionId: string): boolean {
  const c = challenges.get(challengeId);
  if (!c) return false;
  if (c.expiresAt < Date.now()) {
    challenges.delete(challengeId);
    return false;
  }
  if (c.consumed) return false;
  if (c.correctOptionId !== optionId) return false;
  c.verified = true;
  return true;
}

// Called once at login time to actually spend a verified challenge. Returns
// false (and refuses login) if the challenge was never solved, already
// used, or has expired since being solved.
export function consumeChallenge(challengeId: string): boolean {
  const c = challenges.get(challengeId);
  if (!c) return false;
  if (c.expiresAt < Date.now()) {
    challenges.delete(challengeId);
    return false;
  }
  if (!c.verified || c.consumed) return false;
  c.consumed = true;
  challenges.delete(challengeId);
  return true;
}
