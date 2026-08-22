import express from "express";
import {
  login, logout, getMe, getUsers, changePassword, changeUsername, changeEmail, register, googleLogin,
  verifyTwoFactorLogin, setupTwoFactor, confirmTwoFactor, disableTwoFactor,
  getCaptchaChallenge, verifyCaptcha
} from "../controllers/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter, captchaLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

// Captcha (used right before login - no auth, but its own limiter so it
// can't be hammered to enumerate/brute-force challenges either).
router.post("/captcha", captchaLimiter, getCaptchaChallenge);
router.post("/captcha/verify", captchaLimiter, verifyCaptcha);

// Brute-force-sensitive routes get the strict limiter on top of the
// general /api limiter already applied in server.ts.
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/2fa/verify-login", authLimiter, verifyTwoFactorLogin);
router.post("/google", authLimiter, googleLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);
router.get("/users", requireAuth, getUsers);
router.put("/password", requireAuth, changePassword);
router.put("/username", requireAuth, changeUsername);
router.put("/email", requireAuth, changeEmail);

// 2FA management (requires an existing valid session)
router.post("/2fa/setup", requireAuth, setupTwoFactor);
router.post("/2fa/confirm", requireAuth, confirmTwoFactor);
router.post("/2fa/disable", requireAuth, disableTwoFactor);

export default router;
