import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { getAllActivity } from "../controllers/activity.js";

const router = express.Router();

router.get("/", requireAdmin, getAllActivity);

export default router;
