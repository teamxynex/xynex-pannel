import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { getEggs, getEgg, createEgg, deleteEgg, renameCategory } from "../controllers/eggs.js";

const router = express.Router();

router.get("/", requireAuth, getEggs);
router.get("/:id", requireAuth, getEgg);
router.post("/", requireAdmin, createEgg);
router.put("/category", requireAdmin, renameCategory);
router.delete("/:id", requireAdmin, deleteEgg);

export default router;
