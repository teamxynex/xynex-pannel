import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { getMounts, createMount, deleteMount } from "../controllers/mounts.js";

const router = express.Router();

router.get("/", requireAdmin, getMounts);
router.post("/", requireAdmin, createMount);
router.delete("/:id", requireAdmin, deleteMount);

export default router;
