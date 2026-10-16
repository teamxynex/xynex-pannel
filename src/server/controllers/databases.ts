import { Request, Response } from "express";
import { readJSON, writeJSON } from "../services/db.js";
import { ensureMysqlContainer, getMysqlStatus, createDatabaseAndUser, dropDatabaseAndUser } from "../services/mysql.js";
import crypto from "crypto";

export const getHostStatus = async (req: Request, res: Response) => {
  try {
    res.json(await getMysqlStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const startHost = async (req: Request, res: Response) => {
  try {
    res.json(await ensureMysqlContainer());
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to start database host" });
  }
};

export const getDatabases = async (req: Request, res: Response) => {
  const databases = (await readJSON("databases.json")) || [];
  res.json(databases);
};

export const createDatabase = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
      return res.status(400).json({ error: "Database name may only contain letters, numbers, and underscores." });
    }

    const databases = (await readJSON("databases.json")) || [];
    if (databases.some((d: any) => d.dbName === name)) {
      return res.status(400).json({ error: "A database with that name already exists." });
    }

    const status = await ensureMysqlContainer();
    const dbUser = `u_${name}`.slice(0, 32);
    const dbPassword = crypto.randomBytes(12).toString("hex");
    await createDatabaseAndUser(name, dbUser, dbPassword);

    const entry = {
      id: "db-" + crypto.randomUUID(),
      dbName: name,
      dbUser,
      dbPassword,
      host: status.host,
      port: status.port,
      createdAt: new Date().toISOString(),
    };
    databases.push(entry);
    await writeJSON("databases.json", databases);
    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create database" });
  }
};

export const deleteDatabase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const databases = (await readJSON("databases.json")) || [];
    const entry = databases.find((d: any) => d.id === id);
    if (!entry) return res.status(404).json({ error: "Database not found" });

    await dropDatabaseAndUser(entry.dbName, entry.dbUser);
    const remaining = databases.filter((d: any) => d.id !== id);
    await writeJSON("databases.json", remaining);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete database" });
  }
};

// ---------------------------------------------------------------------------
// Per-server, user-facing databases (Pterodactyl-style "Databases" tab).
// Same underlying MySQL host/service as the admin-only endpoints above, but
// scoped to a serverId and reachable by the server's own owner/sub-users,
// not just admins.
// ---------------------------------------------------------------------------

async function findOwnedServer(req: Request, res: Response) {
  const { id } = req.params;
  const user = (req as any).user;
  const servers = (await readJSON("servers.json")) || [];
  const server = servers.find((s: any) => s.id === id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return null;
  }
  if (user.role !== "admin" && user.role !== "owner" && server.owner !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return server;
}

export const getServerDatabases = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  const databases = (await readJSON("databases.json")) || [];
  res.json(databases.filter((d: any) => d.serverId === server.id));
};

export const createServerDatabase = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  try {
    const { name } = req.body;
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
      return res.status(400).json({ error: "Database name may only contain letters, numbers, and underscores." });
    }

    // Namespace by server so two servers can each use a friendly name
    // like "app" without colliding on the shared MySQL host.
    const fullName = `s${server.id.replace(/-/g, "").slice(0, 8)}_${name}`.slice(0, 64);

    const databases = (await readJSON("databases.json")) || [];
    if (databases.some((d: any) => d.dbName === fullName)) {
      return res.status(400).json({ error: "A database with that name already exists on this server." });
    }

    const status = await ensureMysqlContainer();
    const dbUser = `u_${fullName}`.slice(0, 32);
    const dbPassword = crypto.randomBytes(12).toString("hex");
    await createDatabaseAndUser(fullName, dbUser, dbPassword);

    const entry = {
      id: "db-" + crypto.randomUUID(),
      serverId: server.id,
      dbName: fullName,
      displayName: name,
      dbUser,
      dbPassword,
      host: status.host,
      port: status.port,
      createdAt: new Date().toISOString(),
    };
    databases.push(entry);
    await writeJSON("databases.json", databases);

    const { logActivity, requestActor } = await import("../services/activityLog.js");
    logActivity({ ...requestActor(req), serverId: server.id, serverName: server.name, action: "database.create", description: `Created database "${name}"` });

    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create database" });
  }
};

export const deleteServerDatabase = async (req: Request, res: Response) => {
  const server = await findOwnedServer(req, res);
  if (!server) return;
  try {
    const { dbId } = req.params;
    const databases = (await readJSON("databases.json")) || [];
    const entry = databases.find((d: any) => d.id === dbId && d.serverId === server.id);
    if (!entry) return res.status(404).json({ error: "Database not found" });

    await dropDatabaseAndUser(entry.dbName, entry.dbUser);
    await writeJSON("databases.json", databases.filter((d: any) => d.id !== dbId));

    const { logActivity, requestActor } = await import("../services/activityLog.js");
    logActivity({ ...requestActor(req), serverId: server.id, serverName: server.name, action: "database.delete", description: `Deleted database "${entry.displayName || entry.dbName}"` });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete database" });
  }
};
