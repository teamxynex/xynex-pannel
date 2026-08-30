import { Request, Response } from "express";
import crypto from "crypto";
import { readJSON, writeJSON } from "../services/db.js";
import { upsertTunnelHostname, upsertTunnelDns } from "../services/cloudflare.js";

// ---------------------------------------------------------------------------
// Nodes (Pterodactyl-style "Node Management").
//
// A "real" node represents a remote VPS that will run the node daemon and
// register itself against this panel over a Cloudflare Tunnel hostname
// (FQDN). Until the daemon links against it via POST /:uuid/link, the node
// sits in "not_connected" status and cannot be picked for server creation.
//
// If zero real nodes exist, server creation transparently falls back to the
// "Local Node" (the panel's own machine) using the nodeIp/port range already
// configured in settings.json (see routes/system.ts) — see getAvailableForServer.
// ---------------------------------------------------------------------------

function genTokenId() {
  return "node_" + crypto.randomBytes(8).toString("hex");
}

function genToken() {
  return "nodetok_" + crypto.randomBytes(24).toString("hex");
}

// Public node shape returned when listing (no secrets).
function toPublicNode(n: any) {
  return {
    id: n.id,
    name: n.name,
    fqdn: n.fqdn,
    location: n.location || "",
    memory: n.memory,
    disk: n.disk,
    status: n.status,
    isLocal: !!n.isLocal,
    tunnelConfigured: !!n.tunnelConfigured,
    tunnelMessage: n.tunnelMessage || "",
    createdAt: n.createdAt,
    daemon: n.daemon || { ip: null, lastHeartbeat: null },
  };
}

export const listNodes = async (req: Request, res: Response) => {
  try {
    const nodes = (await readJSON("nodes.json")) || [];
    // Hide the implicit Local Node from the main table — it isn't a
    // manually-manageable remote node, just the fallback used when no real
    // node exists yet (see getAvailableForServer).
    res.json(nodes.filter((n: any) => !n.isLocal).map(toPublicNode));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list nodes" });
  }
};

export const getNode = async (req: Request, res: Response) => {
  try {
    const nodes = (await readJSON("nodes.json")) || [];
    const node = nodes.find((n: any) => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: "Node not found" });
    // Configuration tab needs the actual token/tokenId to paste into the
    // installer, so the full record (minus nothing) is returned here —
    // this endpoint is admin-only (see routes/nodes.ts).
    res.json(node);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load node" });
  }
};

export const createNode = async (req: Request, res: Response) => {
  try {
    const { name, fqdn, memory, disk, location } = req.body;
    if (!name || !fqdn) {
      return res.status(400).json({ error: "name and fqdn are required" });
    }

    const nodes = (await readJSON("nodes.json")) || [];
    if (nodes.find((n: any) => n.fqdn.toLowerCase() === String(fqdn).toLowerCase())) {
      return res.status(400).json({ error: "A node with this FQDN already exists" });
    }

    const node: any = {
      id: crypto.randomUUID(),
      name: String(name),
      fqdn: String(fqdn).toLowerCase().trim(),
      location: location ? String(location).trim() : "",
      memory: memory ? Number(memory) : 0,
      disk: disk ? Number(disk) : 0,
      tokenId: genTokenId(),
      token: genToken(),
      status: "not_connected",
      isLocal: false,
      tunnelConfigured: false,
      tunnelMessage: "",
      createdAt: new Date().toISOString(),
      daemon: { ip: null, lastHeartbeat: null },
    };

    // Publish a second application route on the panel's existing Cloudflare
    // Tunnel: <node fqdn> -> the panel's own service. This is what lets the
    // node daemon (once installed on the remote VPS) always reach back to
    // the panel through the tunnel to link/heartbeat, regardless of whether
    // the node's own local service is reachable yet.
    //
    // TODO (if Cloudflare credentials aren't configured under Admin ->
    // Playit/Node tab yet): this call is a no-op stub below. To wire it up,
    // set cloudflareApiToken / cloudflareAccountId / cloudflareTunnelId in
    // settings.json (Admin Panel already has a form for these), then this
    // will call:
    //   PUT /accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations
    //     with an added ingress rule { hostname: fqdn, service: "http://localhost:6767" }
    //   POST/PUT /zones/{zoneId}/dns_records  (proxied CNAME -> {tunnelId}.cfargotunnel.com)
    // both already implemented in src/server/services/cloudflare.ts.
    try {
      const settings = (await readJSON("settings.json")) || {};
      const { cloudflareApiToken, cloudflareAccountId, cloudflareTunnelId, cloudflareNoTlsVerify } = settings;
      if (cloudflareApiToken && cloudflareAccountId && cloudflareTunnelId) {
        const creds = { apiToken: cloudflareApiToken, accountId: cloudflareAccountId, tunnelId: cloudflareTunnelId };
        await upsertTunnelHostname(creds, node.fqdn, "http://localhost:6767", cloudflareNoTlsVerify !== false);
        let dnsConfigured = false;
        try {
          dnsConfigured = await upsertTunnelDns(creds, node.fqdn);
        } catch (e) {
          dnsConfigured = false;
        }
        node.tunnelConfigured = true;
        node.tunnelMessage = dnsConfigured
          ? `${node.fqdn} is routed to this panel over the existing tunnel.`
          : `Route added, but DNS could not be created automatically — add a CNAME for ${node.fqdn} pointing to ${cloudflareTunnelId}.cfargotunnel.com manually.`;
      } else {
        node.tunnelConfigured = false;
        node.tunnelMessage = "Cloudflare Tunnel isn't configured yet (Admin Panel -> Playit/Node tab). Add your API token, Account ID, and Tunnel ID, then recreate this node so its FQDN gets published automatically.";
      }
    } catch (err: any) {
      node.tunnelConfigured = false;
      node.tunnelMessage = `Tunnel route could not be created automatically: ${err.message || err}. You can add it manually in Cloudflare and the daemon will still be able to link once ${node.fqdn} resolves to this panel.`;
    }

    nodes.push(node);
    await writeJSON("nodes.json", nodes);
    res.json(node);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create node" });
  }
};

export const deleteNode = async (req: Request, res: Response) => {
  try {
    const nodes = (await readJSON("nodes.json")) || [];
    const node = nodes.find((n: any) => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: "Node not found" });
    if (node.isLocal) return res.status(400).json({ error: "The Local Node can't be deleted." });

    await writeJSON("nodes.json", nodes.filter((n: any) => n.id !== req.params.id));

    // Clean up allocations that belonged to this node.
    const allocations = (await readJSON("allocations.json")) || [];
    await writeJSON("allocations.json", allocations.filter((a: any) => a.nodeId !== req.params.id));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete node" });
  }
};

// Called by the installer CLI (Option 2 -> "y" auto-configure flow) once the
// admin pastes Panel URL / Node UUID / Token ID / Token into the remote VPS.
// Intentionally NOT behind requireAdmin — the daemon authenticates itself
// with the tokenId/token pair instead of an admin session.
export const linkNode = async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const { tokenId, token } = req.body;
    if (!tokenId || !token) {
      return res.status(400).json({ error: "tokenId and token are required" });
    }

    const nodes = (await readJSON("nodes.json")) || [];
    const idx = nodes.findIndex((n: any) => n.id === uuid);
    if (idx === -1) return res.status(404).json({ error: "Node not found" });

    const node = nodes[idx];
    if (node.tokenId !== tokenId || node.token !== token) {
      return res.status(401).json({ error: "Invalid Token ID / Token for this node" });
    }

    const daemonIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
    node.status = "connected";
    node.daemon = { ip: daemonIp, lastHeartbeat: new Date().toISOString() };
    nodes[idx] = node;
    await writeJSON("nodes.json", nodes);

    req.app.get("io")?.emit("node_status_changed", { id: node.id, status: "connected" });

    res.json({ success: true, message: "Node linked successfully", node: toPublicNode(node) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to link node" });
  }
};

// Lightweight heartbeat the daemon can ping periodically to keep the node
// marked as Connected. If a node goes quiet, the admin panel can compute
// "stale" client-side from daemon.lastHeartbeat.
export const heartbeatNode = async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const { tokenId, token } = req.body;
    const nodes = (await readJSON("nodes.json")) || [];
    const idx = nodes.findIndex((n: any) => n.id === uuid);
    if (idx === -1) return res.status(404).json({ error: "Node not found" });

    const node = nodes[idx];
    if (node.tokenId !== tokenId || node.token !== token) {
      return res.status(401).json({ error: "Invalid Token ID / Token for this node" });
    }

    node.status = "connected";
    node.daemon = node.daemon || {};
    node.daemon.lastHeartbeat = new Date().toISOString();
    nodes[idx] = node;
    await writeJSON("nodes.json", nodes);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to record heartbeat" });
  }
};

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

export const listAllocations = async (req: Request, res: Response) => {
  try {
    const allocations = (await readJSON("allocations.json")) || [];
    res.json(allocations.filter((a: any) => a.nodeId === req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list allocations" });
  }
};

export const createAllocations = async (req: Request, res: Response) => {
  try {
    const { id: nodeId } = req.params;
    const { ip, portFrom, portTo } = req.body;
    const from = Number(portFrom);
    const to = Number(portTo);

    if (!ip || !from || !to || to < from) {
      return res.status(400).json({ error: "ip, portFrom, and portTo (portTo >= portFrom) are required" });
    }
    if (to - from > 5000) {
      return res.status(400).json({ error: "Port range too large — please create allocations in batches under 5000 ports." });
    }

    const nodes = (await readJSON("nodes.json")) || [];
    if (!nodes.find((n: any) => n.id === nodeId)) return res.status(404).json({ error: "Node not found" });

    const allocations = (await readJSON("allocations.json")) || [];
    const existingKeys = new Set(allocations.filter((a: any) => a.nodeId === nodeId).map((a: any) => `${a.ip}:${a.port}`));

    const created: any[] = [];
    for (let port = from; port <= to; port++) {
      const key = `${ip}:${port}`;
      if (existingKeys.has(key)) continue;
      const alloc = { id: crypto.randomUUID(), nodeId, ip: String(ip), port, assigned: false };
      allocations.push(alloc);
      created.push(alloc);
    }

    await writeJSON("allocations.json", allocations);
    res.json({ success: true, created: created.length, allocations: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create allocations" });
  }
};

export const deleteAllocation = async (req: Request, res: Response) => {
  try {
    const allocations = (await readJSON("allocations.json")) || [];
    const remaining = allocations.filter((a: any) => a.id !== req.params.allocId);
    await writeJSON("allocations.json", remaining);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete allocation" });
  }
};

// ---------------------------------------------------------------------------
// Used by Create Server to decide whether to show node selection or fall
// back to the implicit Local Node (Section 5 behaviour).
// ---------------------------------------------------------------------------
export const getAvailableForServer = async (req: Request, res: Response) => {
  try {
    const allNodes = (await readJSON("nodes.json")) || [];
    const realNodes = allNodes.filter((n: any) => !n.isLocal);

    if (realNodes.length === 0) {
      // No remote nodes created yet -> Local Node fallback, driven by the
      // existing nodeIp / port range settings (Admin Panel -> Playit tab).
      const settings = (await readJSON("settings.json")) || {};
      return res.json({
        mode: "local",
        nodeIp: settings.nodeIp || "0.0.0.0",
        portRangeStart: settings.nodePortRangeStart || null,
        portRangeEnd: settings.nodePortRangeEnd || null,
      });
    }

    const allocations = (await readJSON("allocations.json")) || [];
    const nodesWithAllocs = realNodes.map((n: any) => ({
      ...toPublicNode(n),
      freeAllocations: allocations.filter((a: any) => a.nodeId === n.id && !a.assigned).length,
    }));

    res.json({ mode: "select", nodes: nodesWithAllocs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load available nodes" });
  }
};

// Returns (and reserves) the next free allocation for a chosen node —
// called right before submitting Create Server when mode === "select".
export const getNextAllocation = async (req: Request, res: Response) => {
  try {
    const { id: nodeId } = req.params;
    const allocations = (await readJSON("allocations.json")) || [];
    const free = allocations.find((a: any) => a.nodeId === nodeId && !a.assigned);
    if (!free) {
      return res.json({ available: false, message: "No free allocations on this node — add more under its Allocations tab." });
    }
    res.json({ available: true, ip: free.ip, port: free.port, allocationId: free.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to find an available allocation" });
  }
};
