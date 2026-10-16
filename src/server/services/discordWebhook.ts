import { readJSON } from "./db.js";

// Fires a Discord embed to the admin-configured webhook whenever a notable
// server event happens (created, deleted, suspended, unsuspended). Fails
// silently — a webhook hiccup (bad URL, Discord downtime, no internet on
// this node) should never break the actual server action it's reporting on.
export async function notifyDiscord(opts: {
  title: string;
  description: string;
  color?: number; // decimal RGB, e.g. 0x22c55e for green
  fields?: { name: string; value: string; inline?: boolean }[];
}) {
  try {
    const settings = (await readJSON("settings.json")) || {};
    if (!settings.discordNotifyServerEvents || !settings.discordWebhookUrl) return;

    const payload = {
      embeds: [
        {
          title: opts.title,
          description: opts.description,
          color: opts.color ?? 0x6366f1,
          fields: opts.fields || [],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await fetch(settings.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Discord webhook notification failed:", err);
  }
}
