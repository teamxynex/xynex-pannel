import express from "express";
import jwt from "jsonwebtoken";
import { readJSON } from "../services/db.js";

const router = express.Router();
import authRoutes from "./auth.js";
import serverRoutes from "./servers.js";
import systemRoutes from "./system.js";
import apiKeyRoutes from "./api-keys.js";
import eggRoutes from "./eggs.js";
import extensionRoutes from "./extensions.js";
import databaseRoutes from "./databases.js";
import mountRoutes from "./mounts.js";
import nodeRoutes from "./nodes.js";
import activityRoutes from "./activity.js";

router.use("/auth", authRoutes);
router.use("/admin/activity", activityRoutes);
router.use("/servers", serverRoutes);
router.use("/system", systemRoutes);
router.use("/admin/api-keys", apiKeyRoutes);
router.use("/eggs", eggRoutes);
router.use("/extensions", extensionRoutes);
router.use("/databases", databaseRoutes);
router.use("/mounts", mountRoutes);
router.use("/nodes", nodeRoutes);

router.get("/settings", async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  res.json({ 
    panelName: settings.panelName || "XyneX Panel",
    panelLogo: settings.panelLogo || "",
    panelBackgroundImage: settings.panelBackgroundImage || "",
    panelBackgroundBlur: settings.panelBackgroundBlur !== undefined ? settings.panelBackgroundBlur : 10,
    enablePlayit: settings.enablePlayit !== undefined ? settings.enablePlayit : false,
    enableTutorial: settings.enableTutorial !== undefined ? settings.enableTutorial : true,
    enableLoginAnimation: settings.enableLoginAnimation !== undefined ? settings.enableLoginAnimation : true,
    enableRegistration: settings.enableRegistration !== undefined ? settings.enableRegistration : true,
    theme: settings.theme || "indigo",
    enableGoogleLogin: settings.enableGoogleLogin !== undefined ? settings.enableGoogleLogin : false,
    firebaseApiKey: settings.firebaseApiKey || "",
    firebaseAuthDomain: settings.firebaseAuthDomain || "",
    firebaseProjectId: settings.firebaseProjectId || "",
    firebaseStorageBucket: settings.firebaseStorageBucket || "",
    firebaseMessagingSenderId: settings.firebaseMessagingSenderId || "",
    firebaseAppId: settings.firebaseAppId || "",
    nodeIp: settings.nodeIp || "",
    nodePortRangeStart: settings.nodePortRangeStart || null,
    nodePortRangeEnd: settings.nodePortRangeEnd || null,
  });
});

export default router;
