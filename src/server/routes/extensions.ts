import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { getExtensions, createExtension, toggleExtension, deleteExtension } from "../controllers/extensions.js";

const router = express.Router();

router.get("/", requireAuth, getExtensions);
router.post("/", requireAdmin, createExtension);
router.put("/:id/toggle", requireAdmin, toggleExtension);
router.delete("/:id", requireAdmin, deleteExtension);

export default router;
