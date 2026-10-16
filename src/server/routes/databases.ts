import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { getHostStatus, startHost, getDatabases, createDatabase, deleteDatabase } from "../controllers/databases.js";

const router = express.Router();

router.get("/", requireAdmin, getDatabases);
router.post("/", requireAdmin, createDatabase);
router.delete("/:id", requireAdmin, deleteDatabase);
router.get("/host/status", requireAdmin, getHostStatus);
router.post("/host/start", requireAdmin, startHost);

export default router;
