import express from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import {
  listNodes,
  getNode,
  createNode,
  deleteNode,
  linkNode,
  heartbeatNode,
  listAllocations,
  createAllocations,
  deleteAllocation,
  getAvailableForServer,
  getNextAllocation,
} from "../controllers/nodes.js";

const router = express.Router();

// Public, token-authenticated endpoints the node daemon (installer's
// "Install Node" -> auto-configure flow) calls directly — these can't sit
// behind requireAdmin since the remote VPS has no admin session.
router.post("/:uuid/link", linkNode);
router.post("/:uuid/heartbeat", heartbeatNode);

// Used by Create Server (any authenticated user reaching that page).
router.get("/available/for-server", requireAuth, getAvailableForServer);
router.get("/:id/next-allocation", requireAuth, getNextAllocation);

// Admin-only node management.
router.get("/", requireAdmin, listNodes);
router.post("/", requireAdmin, createNode);
router.get("/:id", requireAdmin, getNode);
router.delete("/:id", requireAdmin, deleteNode);

router.get("/:id/allocations", requireAdmin, listAllocations);
router.post("/:id/allocations", requireAdmin, createAllocations);
router.delete("/:id/allocations/:allocId", requireAdmin, deleteAllocation);

export default router;
