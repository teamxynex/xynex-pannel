import express from "express";
import { getVersions } from "../services/docker.js";
import { requireAuth } from "../middleware/auth.js";
import os from "os";
import { readJSON, writeJSON } from "../services/db.js";
import bcrypt from "bcryptjs";
import { upsertTunnelHostname, upsertTunnelDns } from "../services/cloudflare.js";
import { banIp, unbanIp, listBannedIps } from "../middleware/ipBan.js";
import { getTrafficSnapshot, getTrackedIpCount } from "../middleware/trafficStats.js";

const router = express.Router();

router.use(requireAuth);

router.get("/next-port", async (req, res) => {
  try {
    const settings = await readJSON("settings.json") || {};
    const start = Number(settings.nodePortRangeStart);
    const end = Number(settings.nodePortRangeEnd);
    if (!start || !end || end < start) {
      return res.json({ available: false, message: "No port range configured for this node yet." });
    }
    const servers = await readJSON("servers.json") || [];
    const usedPorts = new Set(servers.map((s: any) => Number(s.port)));
    for (let p = start; p <= end; p++) {
      if (!usedPorts.has(p)) {
        return res.json({ available: true, port: p, nodeIp: settings.nodeIp || "" });
      }
    }
    res.json({ available: false, message: "Every port in the configured range is already in use." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to find an available port" });
  }
});

router.get("/versions", async (req, res) => {
  const type = (req.query.type as string) || "PAPER";
  const versions = await getVersions(type);
  res.json(versions);
});

// Deprecated endpoint for backward compatibility
router.get("/paper-versions", async (req, res) => {
  const versions = await getVersions("PAPER");
  res.json(versions);
});

router.get("/stats", (req, res) => {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  
  res.json({
    cpuUsage: Math.round(os.loadavg()[0] * 100) / 100, // rough approx
    totalMemory,
    freeMemory,
    ramUsage: Math.round(((totalMemory - freeMemory) / totalMemory) * 100),
    diskUsage: 0, // Mocked for now
  });
});

router.get("/users", async (req, res) => {
  const user = (req as any).user;
  if(user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden"});
  const users = await readJSON("users.json") || [];
  // never return passwords
  res.json(users.map((u: any) => ({ id: u.id, username: u.username, role: u.role || 'admin', isGoogleUser: !!u.googleId, createdAt: u.createdAt, lastIp: u.lastIp || null, lastLoginAt: u.lastLoginAt || null })));
});

router.post("/users", async (req, res) => {
  const user = (req as any).user;
  if(user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden"});
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "Missing fields" });

  const users = await readJSON("users.json") || [];
  if (users.find((u: any) => u.username === username)) return res.status(400).json({ error: "Username taken" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUserId = Date.now().toString();
  users.push({
    id: newUserId,
    username,
    password: hashedPassword,
    role,
    createdAt: new Date().toISOString()
  });

  await writeJSON("users.json", users);
  res.json({ success: true, id: newUserId, username, role });
});

router.delete("/users/:id", async (req, res) => {
  const user = (req as any).user;
  if(user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden"});
  
  let users = await readJSON("users.json") || [];
  users = users.filter((u: any) => u.id !== req.params.id);
  await writeJSON("users.json", users);
  res.json({ success: true });
});


router.put("/users/:id/password", async (req, res) => {
  const user = (req as any).user;
  if(user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden"});
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  
  const users = await readJSON("users.json") || [];
  const targetIndex = users.findIndex((u: any) => u.id === req.params.id);
  if (targetIndex === -1) return res.status(404).json({ error: "User not found" });
  
  if (users[targetIndex].id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change password of default admin account." });
  }

  if (users[targetIndex].googleId || !users[targetIndex].password) {
    return res.status(400).json({ error: "Cannot change password for Google authenticated accounts." });
  }
  
  const bcrypt = await import("bcryptjs");
  const hashedPassword = await bcrypt.default.hash(newPassword, 10);
  users[targetIndex].password = hashedPassword;
  users[targetIndex].passwordVersion = (users[targetIndex].passwordVersion || 0) + 1;
  await writeJSON("users.json", users);
  res.json({ success: true });
});

// Force-logout a user everywhere immediately by bumping their
// passwordVersion - every existing JWT for that account fails the
// passwordVersion check in requireAuth/requireAdmin on its very next
// request, without needing a server-side session store.
router.post("/users/:id/terminate", async (req, res) => {
  const admin = (req as any).user;
  if (admin.role !== "admin" && admin.role !== "owner") return res.status(403).json({ error: "Forbidden" });

  const users = await readJSON("users.json") || [];
  const targetIndex = users.findIndex((u: any) => u.id === req.params.id);
  if (targetIndex === -1) return res.status(404).json({ error: "User not found" });

  if (users[targetIndex].id === "temp-admin") {
    return res.status(400).json({ error: "Cannot terminate sessions for the default admin account." });
  }

  users[targetIndex].passwordVersion = (users[targetIndex].passwordVersion || 0) + 1;
  await writeJSON("users.json", users);
  res.json({ success: true });
});

// Ban the last IP address a given user logged in from. Requires the user
// to have logged in at least once since IP tracking was added.
router.post("/users/:id/ban-ip", async (req, res) => {
  const admin = (req as any).user;
  if (admin.role !== "admin" && admin.role !== "owner") return res.status(403).json({ error: "Forbidden" });

  const users = await readJSON("users.json") || [];
  const target = users.find((u: any) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });

  if (!target.lastIp) {
    return res.status(400).json({ error: "No known IP address on record for this user yet (they need to log in at least once first)." });
  }

  await banIp(target.lastIp, `Banned via Admin Panel (user: ${target.username})`, admin.username || admin.id);
  res.json({ success: true, ip: target.lastIp });
});

router.get("/banned-ips", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  res.json(await listBannedIps());
});

router.post("/banned-ips", async (req, res) => {
  const admin = (req as any).user;
  if (admin.role !== "admin" && admin.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const { ip, reason } = req.body;
  if (!ip || typeof ip !== "string") return res.status(400).json({ error: "An IP address is required" });
  await banIp(ip.trim(), reason || "", admin.username || admin.id);
  res.json({ success: true });
});

router.delete("/banned-ips/:ip", async (req, res) => {
  const admin = (req as any).user;
  if (admin.role !== "admin" && admin.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  await unbanIp(decodeURIComponent(req.params.ip));
  res.json({ success: true });
});

// Live per-IP traffic snapshot (requests in the last ~60s), for the admin
// "Traffic" tab. Lets an admin spot a flood and ban the source IP directly.
router.get("/traffic", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  res.json({
    rows: getTrafficSnapshot(50),
    trackedIps: getTrackedIpCount(),
  });
});

router.get("/cloudflare", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });
  const settings = await readJSON("settings.json") || {};
  res.json({
    cloudflareDomain: settings.cloudflareDomain || "",
    cloudflareApiToken: settings.cloudflareApiToken || "",
    cloudflareAccountId: settings.cloudflareAccountId || "",
    cloudflareTunnelId: settings.cloudflareTunnelId || "",
    cloudflareNoTlsVerify: settings.cloudflareNoTlsVerify !== undefined ? settings.cloudflareNoTlsVerify : true,
  });
});

router.post("/cloudflare/connect", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden" });

  const settings = await readJSON("settings.json") || {};
  const { cloudflareDomain, cloudflareApiToken, cloudflareAccountId, cloudflareTunnelId, cloudflareNoTlsVerify } = settings;

  if (!cloudflareDomain || !cloudflareApiToken || !cloudflareAccountId || !cloudflareTunnelId) {
    return res.status(400).json({ error: "Domain, API Token, Account ID, and Tunnel ID are all required." });
  }

  try {
    const creds = { apiToken: cloudflareApiToken, accountId: cloudflareAccountId, tunnelId: cloudflareTunnelId };
    await upsertTunnelHostname(creds, cloudflareDomain, "http://localhost:6767", cloudflareNoTlsVerify !== false);

    let dnsConfigured = false;
    try {
      dnsConfigured = await upsertTunnelDns(creds, cloudflareDomain);
    } catch (e) {
      dnsConfigured = false;
    }

    res.json({
      success: true,
      dnsConfigured,
      message: dnsConfigured
        ? `${cloudflareDomain} is now routed to this panel over HTTPS.`
        : `Route configured, but DNS could not be created automatically — add a CNAME record for ${cloudflareDomain} pointing to ${cloudflareTunnelId}.cfargotunnel.com manually.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to configure Cloudflare Tunnel" });
  }
});

router.put("/settings", async (req, res) => {
  const user = (req as any).user;
  if(user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden"});
  const { 
    panelName, panelLogo, panelBackgroundImage, panelBackgroundBlur, 
    enablePlayit, enableTutorial, enableLoginAnimation, enableRegistration, theme,
    enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId,
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId,
    cloudflareDomain, cloudflareApiToken, cloudflareAccountId, cloudflareTunnelId, cloudflareNoTlsVerify,
    nodeIp, nodePortRangeStart, nodePortRangeEnd
  } = req.body;
  const settings = await readJSON("settings.json") || {};
  if (panelName !== undefined) {
    settings.panelName = panelName || "XyneX Panel";
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const targetPaths = [
        path.join(process.cwd(), "index.html"),
        path.join(process.cwd(), "dist", "index.html")
      ];
      for (const p of targetPaths) {
        try {
          let html = await fs.readFile(p, "utf-8");
          html = html.replace(/<title>.*<\/title>/i, `<title>${settings.panelName}</title>`);
          await fs.writeFile(p, html, "utf-8");
        } catch (e) {
          // Ignore if file doesn't exist
        }
      }
    } catch (err) {
      console.error("Error updating html title:", err);
    }
  }
  if (panelLogo !== undefined) settings.panelLogo = panelLogo;
  if (panelBackgroundImage !== undefined) settings.panelBackgroundImage = panelBackgroundImage;
  if (panelBackgroundBlur !== undefined) settings.panelBackgroundBlur = panelBackgroundBlur;
  if (enablePlayit !== undefined) settings.enablePlayit = enablePlayit;
  if (enableTutorial !== undefined) settings.enableTutorial = enableTutorial;
  if (enableLoginAnimation !== undefined) settings.enableLoginAnimation = enableLoginAnimation;
  if (enableRegistration !== undefined) settings.enableRegistration = enableRegistration;
  if (theme !== undefined) settings.theme = theme;
  if (enableGoogleLogin !== undefined) settings.enableGoogleLogin = enableGoogleLogin;
  if (firebaseApiKey !== undefined) settings.firebaseApiKey = firebaseApiKey;
  if (firebaseAuthDomain !== undefined) settings.firebaseAuthDomain = firebaseAuthDomain;
  if (firebaseProjectId !== undefined) settings.firebaseProjectId = firebaseProjectId;
  if (firebaseStorageBucket !== undefined) settings.firebaseStorageBucket = firebaseStorageBucket;
  if (firebaseMessagingSenderId !== undefined) settings.firebaseMessagingSenderId = firebaseMessagingSenderId;
  if (firebaseAppId !== undefined) settings.firebaseAppId = firebaseAppId;
  if (cloudflareDomain !== undefined) settings.cloudflareDomain = cloudflareDomain;
  if (cloudflareApiToken !== undefined) settings.cloudflareApiToken = cloudflareApiToken;
  if (cloudflareAccountId !== undefined) settings.cloudflareAccountId = cloudflareAccountId;
  if (cloudflareTunnelId !== undefined) settings.cloudflareTunnelId = cloudflareTunnelId;
  if (cloudflareNoTlsVerify !== undefined) settings.cloudflareNoTlsVerify = cloudflareNoTlsVerify;
  if (nodeIp !== undefined) settings.nodeIp = nodeIp;
  if (nodePortRangeStart !== undefined) settings.nodePortRangeStart = nodePortRangeStart;
  if (nodePortRangeEnd !== undefined) settings.nodePortRangeEnd = nodePortRangeEnd;
  await writeJSON("settings.json", settings);
  req.app.get("io")?.emit("settings_updated");
  res.json({ success: true });
});

router.post("/update", async (req, res) => {
  const user = (req as any).user;
  if(user.role !== "admin" && user.role !== "owner") return res.status(403).json({ error: "Forbidden"});

  // Broadcast to all clients to refresh in a few seconds
  const io = req.app.get("io");
  if (io) {
    io.emit("system_update_started");
  }

  res.json({ success: true, message: "Update process started" });

  const { exec } = await import("child_process");
  setTimeout(() => {
    exec("bash update.sh", (error, stdout, stderr) => {
      console.log(`Update stdout: ${stdout}`);
      console.error(`Update stderr: ${stderr}`);
    });
  }, 1000);
});





export default router;
