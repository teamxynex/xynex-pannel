import { readJSON, writeJSON } from "./db.js";
import { stopContainer } from "./docker.js";

// Equivalent of the "SAGA AutoSuspension" Pterodactyl addon: any server
// with an `expirationDate` in the past that isn't already suspended gets
// stopped and marked suspended automatically.
export async function checkExpiredServers() {
  try {
    const servers = await readJSON("servers.json") || [];
    const now = new Date();
    let changed = false;

    for (const server of servers) {
      if (server.expirationDate && !server.suspended) {
        const expiry = new Date(server.expirationDate);
        if (!isNaN(expiry.getTime()) && expiry <= now) {
          console.log(`[auto-suspension] "${server.name}" reached its expiration date — suspending.`);
          server.suspended = true;
          server.suspendDuration = "expired";
          changed = true;

          if (server.containerId) {
            try {
              await stopContainer(server.containerId);
            } catch (e) {
              console.error(`[auto-suspension] failed to stop container for ${server.name}:`, e);
            }
          }
        }
      }
    }

    if (changed) {
      await writeJSON("servers.json", servers);
    }
  } catch (e) {
    console.error("[auto-suspension] check failed:", e);
  }
}

let started = false;

export function startAutoSuspensionScheduler(intervalMs = 60 * 1000) {
  if (started) return;
  started = true;
  checkExpiredServers();
  setInterval(checkExpiredServers, intervalMs);
  console.log("[auto-suspension] scheduler started — checking every " + Math.round(intervalMs / 1000) + "s");
}
