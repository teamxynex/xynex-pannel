import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";
import fs from "fs-extra";
import jwt from "jsonwebtoken";
import { apiLimiter } from "./src/server/middleware/rateLimit.js";
import { checkIpBanMiddleware } from "./src/server/middleware/ipBan.js";
import { trackTraffic } from "./src/server/middleware/trafficStats.js";

if (!process.env.JWT_SECRET) {
  console.warn(
    "\x1b[33m[WARNING]\x1b[0m JWT_SECRET is not set in your environment. Falling back to an " +
    "insecure default secret - anyone who knows/guesses it can forge admin tokens. " +
    "Set a long random JWT_SECRET in your .env file before exposing this panel publicly."
  );
}

const app = express();
const httpServer = createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});
app.set("io", io);

// Initialize data folders
const DATA_DIR = path.join(process.cwd(), ".data");
const SERVERS_DIR = path.join(DATA_DIR, "servers");
const BACKUPS_DIR = path.join(process.cwd(), "backups");

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(SERVERS_DIR);
fs.ensureDirSync(BACKUPS_DIR);
fs.ensureDirSync(path.join(DATA_DIR, "temp"));

if (!fs.existsSync(path.join(DATA_DIR, "users.json"))) fs.writeFileSync(path.join(DATA_DIR, "users.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "servers.json"))) fs.writeFileSync(path.join(DATA_DIR, "servers.json"), "[]");
if (!fs.existsSync(path.join(DATA_DIR, "settings.json"))) fs.writeFileSync(path.join(DATA_DIR, "settings.json"), "{}");

import { attachContainerSocket, getContainerLogs } from "./src/server/services/docker.js";

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || "xynex-panel-super-secret");
    (socket as any).user = verified;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  // Support chat rooms: staff auto-join the admin broadcast room; everyone
  // gets their own user room so ticket updates reach them regardless of
  // which specific ticket room they're currently viewing.
  const socketUser = (socket as any).user;
  if (socketUser) {
    if (socketUser.role === "admin" || socketUser.role === "owner") {
      socket.join("support_admins");
    }
    socket.join(`support_user_${socketUser.id}`);
  }
  socket.on("joinTicket", (ticketId) => {
    socket.join(`support_${ticketId}`);
  });
  socket.on("leaveTicket", (ticketId) => {
    socket.leave(`support_${ticketId}`);
  });

  socket.on("joinServer", async (serverId) => {
    socket.join(`server_${serverId}`);
    
    // Ensure logs are streamed if container is already running
    try {
      const serversJSON = await fs.readFile(path.join(DATA_DIR, "servers.json"), "utf8");
      const servers = JSON.parse(serversJSON);
      const server = Array.isArray(servers) ? servers.find((s: any) => s.id === serverId) : null;
      if (server && server.containerId) {
        const logs = await getContainerLogs(server.containerId);
        if (logs) {
           socket.emit("log", logs.trim() + "\n");
        }
        await attachContainerSocket(server.containerId, serverId);
      }
    } catch (e) {
      console.error(e);
    }
  });
  socket.on("leaveServer", (serverId) => {
    socket.leave(`server_${serverId}`);
  });
});

const PORT = process.env.PORT || 6767;

// Security headers (helmet). CSP is left disabled for now since the panel
// serves a Vite/React SPA with inline styles/scripts that would otherwise
// need a carefully tuned policy - the other protections (HSTS, no-sniff,
// frameguard/clickjacking protection, hidden X-Powered-By, referrer policy,
// etc.) are enabled and apply immediately. Tighten contentSecurityPolicy
// once the frontend's script/style sources are audited.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "50gb" }));
app.use(express.urlencoded({ extended: true, limit: "50gb" }));
app.use(cors());

// Count every request per-IP (even ones that will be rejected below) so a
// flood shows up in the admin "Traffic" tab regardless of outcome.
app.use(trackTraffic);

// Reject banned IPs before they can burn rate-limit quota or reach any route.
app.use(checkIpBanMiddleware);

// General abuse-prevention limiter across the whole API. Auth routes get
// their own, much stricter limiter (see src/server/middleware/rateLimit.ts).
app.use("/api", apiLimiter);

import apiRoutes from "./src/server/routes/api.js";
app.use("/api", apiRoutes);

import { initSFTPServer } from "./src/server/services/sftp.js";
import { startAutoSuspensionScheduler } from "./src/server/services/scheduler.js";
import { startTaskScheduler } from "./src/server/services/taskScheduler.js";

async function startServer() {
  await initSFTPServer();
  startAutoSuspensionScheduler();
  startTaskScheduler();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, () => {
    console.log(`XyneX Panel running on port ${PORT}`);
  });
}

startServer();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  fs.writeFileSync('crash.log', String(err.stack));
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  fs.writeFileSync('crash.log', String(reason));
});
