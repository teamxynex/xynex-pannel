import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { readJSON, writeJSON } from "../services/db.js";
import { createChallenge, verifyChallenge, consumeChallenge } from "../services/captcha.js";
import { getClientIp } from "../middleware/ipBan.js";

const JWT_SECRET = process.env.JWT_SECRET || "xynex-panel-super-secret";

export const register = async (req: Request, res: Response) => {
  const settings = await readJSON("settings.json") || {};
  if (settings.enableRegistration === false) {
    res.status(403).json({ error: "User registration is currently disabled by administrator." });
    return;
  }

  const { username, password, confirmPassword } = req.body;

  if (!username || !password || !confirmPassword) {
    res.status(400).json({ error: "Username, password, and confirm password are required" });
    return;
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const users = await readJSON("users.json") || [];
  const existingUser = users.find((u: any) => u.username.toLowerCase() === cleanUsername.toLowerCase());

  if (existingUser) {
    res.status(400).json({ error: "Username is already taken" });
    return;
  }

  const { writeJSON } = await import("../services/db.js");
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const newUser = {
    id: "user-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
    username: cleanUsername,
    password: hashedPassword,
    role: "user",
    passwordVersion: 0
  };

  users.push(newUser);
  await writeJSON("users.json", users);

  res.status(201).json({
    message: "User registered successfully",
    user: { id: newUser.id, username: newUser.username, role: newUser.role }
  });
};

export const getCaptchaChallenge = (req: Request, res: Response) => {
  const { challengeId, target, options } = createChallenge();
  res.json({ challengeId, target, options });
};

export const verifyCaptcha = (req: Request, res: Response) => {
  const { challengeId, optionId } = req.body;
  if (!challengeId || !optionId) {
    res.status(400).json({ error: "challengeId and optionId are required" });
    return;
  }
  const ok = verifyChallenge(challengeId, optionId);
  if (!ok) {
    res.status(400).json({ error: "That's not quite right. Try again." });
    return;
  }
  res.json({ success: true });
};

export const login = async (req: Request, res: Response) => {
  const { username, password, challengeId } = req.body;

  if (!challengeId || !consumeChallenge(challengeId)) {
    res.status(400).json({ error: "Please complete the captcha before logging in." });
    return;
  }

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  // NOTE: this used to evaluate to `true` in almost every real deployment
  // (any time PORT wasn't the literal string "6767"), which meant *any*
  // username/password typed at the login screen would silently create a
  // brand-new admin account and log the attacker straight in - a full
  // authentication bypass. It is now opt-in only, off by default, and
  // requires an explicit environment flag so it can never fire in a
  // production deployment by accident.
  const isDevMode =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_AUTO_LOGIN === "true";

  if (isDevMode) {
    const users = await readJSON("users.json") || [];
    let user = users.find((u: any) => u.username === username);

    if (!user) {
      const { writeJSON } = await import("../services/db.js");
      const hashedPassword = await bcrypt.hash(password, 10);
      user = {
        id: "dev-user-" + Math.random().toString(36).substr(2, 9),
        username,
        password: hashedPassword,
        role: "admin",
        passwordVersion: 0
      };
      users.push(user);
      await writeJSON("users.json", users);
    }

    const role = user.role || "admin";
    user.lastIp = getClientIp(req);
    user.lastLoginAt = new Date().toISOString();
    const { writeJSON: writeUsersJSON } = await import("../services/db.js");
    await writeUsersJSON("users.json", users);
    const token = jwt.sign(
      { id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, username: user.username, role } });
    return;
  }

  const users = await readJSON("users.json") || [];
  
  const user = users.find((u: any) => u.username === username);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  user.lastIp = getClientIp(req);
  user.lastLoginAt = new Date().toISOString();
  await writeJSON("users.json", users);

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    // Password is correct, but the account has TOTP 2FA enabled - issue a
    // short-lived pre-auth token instead of a real session token. The
    // client must exchange it (plus a valid TOTP code) at
    // POST /api/auth/2fa/verify-login within 5 minutes.
    const preAuthToken = jwt.sign({ id: user.id, stage: "2fa" }, JWT_SECRET, { expiresIn: "5m" });
    res.json({ requires2FA: true, tempToken: preAuthToken });
    return;
  }

  const role = user.role || "admin";
  const token = jwt.sign({ id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 }, JWT_SECRET, { expiresIn: "7d" });

  (async () => { const { logActivity } = await import("../services/activityLog.js"); logActivity({ userId: user.id, username: user.username, action: "auth.login", description: `${user.username} logged in`, ip: getClientIp(req) }); })();

  res.json({ token, user: { id: user.id, username: user.username, role } });
};

// Step 2 of login when the account has 2FA enabled: exchange the short-lived
// pre-auth token + a current TOTP code for a real session token.
export const verifyTwoFactorLogin = async (req: Request, res: Response) => {
  const { tempToken, code } = req.body;

  if (!tempToken || !code) {
    res.status(400).json({ error: "Temporary token and authentication code are required" });
    return;
  }

  let decoded: any;
  try {
    decoded = jwt.verify(tempToken, JWT_SECRET);
  } catch (err) {
    res.status(401).json({ error: "Your session expired, please log in again" });
    return;
  }

  if (decoded.stage !== "2fa" || !decoded.id) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  const users = await readJSON("users.json") || [];
  const user = users.find((u: any) => u.id === decoded.id);

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    res.status(400).json({ error: "Two-factor authentication is not enabled for this account" });
    return;
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: String(code).trim(),
    window: 1,
  });

  if (!verified) {
    res.status(401).json({ error: "Invalid authentication code" });
    return;
  }

  user.lastIp = getClientIp(req);
  user.lastLoginAt = new Date().toISOString();
  await writeJSON("users.json", users);

  const role = user.role || "admin";
  const token = jwt.sign({ id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ token, user: { id: user.id, username: user.username, role } });
};

// Begin 2FA setup: generates a new TOTP secret (stored as "pending" until
// confirmed with a valid code) and returns a QR code the user can scan with
// Google Authenticator / Authy / 1Password etc.
export const setupTwoFactor = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;

  if (reqUser.id === "temp-admin") {
    res.status(400).json({ error: "Cannot enable 2FA on the default admin account. Create a real admin user instead." });
    return;
  }

  const users = await readJSON("users.json") || [];
  const idx = users.findIndex((u: any) => u.id === reqUser.id);

  if (idx === -1) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (users[idx].twoFactorEnabled) {
    res.status(400).json({ error: "Two-factor authentication is already enabled" });
    return;
  }

  const secret = speakeasy.generateSecret({
    length: 20,
    name: `XyneX Panel (${users[idx].username})`,
  });

  users[idx].twoFactorTempSecret = secret.base32;
  await writeJSON("users.json", users);

  const qrCode = await QRCode.toDataURL(secret.otpauth_url as string);

  res.json({ secret: secret.base32, qrCode });
};

// Confirm 2FA setup by verifying one code generated from the pending secret.
export const confirmTwoFactor = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Authentication code is required" });
    return;
  }

  const users = await readJSON("users.json") || [];
  const idx = users.findIndex((u: any) => u.id === reqUser.id);

  if (idx === -1) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const tempSecret = users[idx].twoFactorTempSecret;
  if (!tempSecret) {
    res.status(400).json({ error: "No pending 2FA setup found. Please start setup again." });
    return;
  }

  const verified = speakeasy.totp.verify({
    secret: tempSecret,
    encoding: "base32",
    token: String(code).trim(),
    window: 1,
  });

  if (!verified) {
    res.status(400).json({ error: "Invalid code, please try again" });
    return;
  }

  users[idx].twoFactorSecret = tempSecret;
  users[idx].twoFactorEnabled = true;
  delete users[idx].twoFactorTempSecret;
  await writeJSON("users.json", users);

  res.json({ success: true });
};

// Disable 2FA - requires both the account password (for locally-authed
// users) and a valid current TOTP code, so a stolen/leaked session token
// alone isn't enough to turn off the second factor.
export const disableTwoFactor = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { password, code } = req.body;

  const users = await readJSON("users.json") || [];
  const idx = users.findIndex((u: any) => u.id === reqUser.id);

  if (idx === -1) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = users[idx];

  if (!user.twoFactorEnabled) {
    res.status(400).json({ error: "Two-factor authentication is not enabled" });
    return;
  }

  if (user.password) {
    const isMatch = await bcrypt.compare(password || "", user.password);
    if (!isMatch) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: String(code || "").trim(),
    window: 1,
  });

  if (!verified) {
    res.status(401).json({ error: "Invalid authentication code" });
    return;
  }

  user.twoFactorEnabled = false;
  delete user.twoFactorSecret;
  delete user.twoFactorTempSecret;
  await writeJSON("users.json", users);

  res.json({ success: true });
};

export const logout = (req: Request, res: Response) => {
  res.json({ message: "Logged out" });
};

export const getMe = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  if (reqUser && reqUser.id !== "temp-admin") {
    const users = await readJSON("users.json") || [];
    const dbUser = users.find((u: any) => u.id === reqUser.id);
    if (dbUser) {
      return res.json({
        user: {
          ...reqUser,
          email: dbUser.email || null,
          googleId: dbUser.googleId || null,
          isGoogleUser: !!(dbUser.googleId || !dbUser.password),
          twoFactorEnabled: !!dbUser.twoFactorEnabled
        }
      });
    }
  }
  res.json({ user: reqUser });
};

export const getUsers = async (req: Request, res: Response) => {
  const users = await readJSON("users.json") || [];
  res.json(users.map((u: any) => ({ id: u.id, username: u.username, role: u.role, isGoogleUser: !!u.googleId, lastIp: u.lastIp || null })));
};

export const changeUsername = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { newUsername } = req.body;

  if (!newUsername || typeof newUsername !== "string" || newUsername.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters long." });
  }

  const cleanUsername = newUsername.trim();

  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change username of default admin account." });
  }

  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u: any) => u.id === reqUser.id);

  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!users[userIndex].googleId) {
    return res.status(400).json({ error: "Username change is only available for Google authenticated accounts." });
  }

  const existingUser = users.find((u: any) => u.id !== reqUser.id && u.username && u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: `Username '${cleanUsername}' is already taken.` });
  }

  users[userIndex].username = cleanUsername;
  await writeJSON("users.json", users);

  res.json({ success: true, username: cleanUsername });
};

export const changePassword = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { oldPassword, newPassword } = req.body;
  
  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change password of default admin account. Create a new admin user instead." });
  }

  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u: any) => u.id === reqUser.id);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  if (users[userIndex].googleId || !users[userIndex].password) {
    return res.status(400).json({ error: "Password change is disabled for Google Auth accounts." });
  }

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  
  const isMatch = await bcrypt.compare(oldPassword || "", users[userIndex].password);
  if (!isMatch) {
    return res.status(401).json({ error: "Incorrect old password" });
  }

  // Use dynamic import for writeJSON since it's in another file
  const { writeJSON } = await import("../services/db.js");
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  users[userIndex].password = hashedPassword;
  users[userIndex].passwordVersion = (users[userIndex].passwordVersion || 0) + 1;
  await writeJSON("users.json", users);
  
  res.json({ success: true });
};

export const changeEmail = async (req: Request, res: Response) => {
  const reqUser = (req as any).user;
  const { newEmail, password } = req.body;

  if (reqUser.id === "temp-admin") {
    return res.status(400).json({ error: "Cannot change email of default admin account. Create a new admin user instead." });
  }

  if (!newEmail || typeof newEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const cleanEmail = newEmail.trim().toLowerCase();

  const users = await readJSON("users.json") || [];
  const userIndex = users.findIndex((u: any) => u.id === reqUser.id);

  if (userIndex === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const target = users[userIndex];

  // Local (password-based) accounts must confirm their current password
  // before changing the email on file, same as a password change.
  if (target.password) {
    const isMatch = await bcrypt.compare(password || "", target.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password" });
    }
  }

  const existingUser = users.find((u: any) => u.id !== reqUser.id && u.email && u.email.toLowerCase() === cleanEmail);
  if (existingUser) {
    return res.status(400).json({ error: "This email address is already in use." });
  }

  target.email = cleanEmail;
  await writeJSON("users.json", users);

  res.json({ success: true, email: cleanEmail });
};

export const googleLogin = async (req: Request, res: Response) => {
  const { email, googleId, name, photoURL } = req.body;

  if (!email) {
    res.status(400).json({ error: "Google email is required" });
    return;
  }

  const settings = await readJSON("settings.json") || {};
  if (settings.enableGoogleLogin === false) {
    res.status(403).json({ error: "Google Login is disabled on this panel." });
    return;
  }

  // Derive username from Gmail (e.g. jishnumondal32@gmail.com -> jishnumondal32)
  const emailPrefix = email.split("@")[0].replace(/[^a-zA-Z0-9_.]/g, "");
  const baseUsername = emailPrefix || "user";

  const users = await readJSON("users.json") || [];
  let user = users.find((u: any) => (u.email && u.email.toLowerCase() === email.toLowerCase()) || (u.googleId && u.googleId === googleId) || (u.username && u.username.toLowerCase() === baseUsername.toLowerCase()));

  if (!user) {
    // If no users exist yet in system at all, make this user an admin!
    const isFirstUser = users.length === 0;
    const role = isFirstUser ? "admin" : "user";

    const { writeJSON } = await import("../services/db.js");
    user = {
      id: "google-user-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      username: baseUsername,
      email,
      googleId,
      role,
      avatar: photoURL || "",
      passwordVersion: 0,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeJSON("users.json", users);
  } else {
    // Link email & googleId if missing
    let updated = false;
    if (!user.email) { user.email = email; updated = true; }
    if (!user.googleId) { user.googleId = googleId; updated = true; }
    if (photoURL && !user.avatar) { user.avatar = photoURL; updated = true; }
    if (updated) {
      const { writeJSON } = await import("../services/db.js");
      await writeJSON("users.json", users);
    }
  }

  user.lastIp = getClientIp(req);
  user.lastLoginAt = new Date().toISOString();
  await writeJSON("users.json", users);

  const role = user.role || "admin";
  const token = jwt.sign(
    { id: user.id, username: user.username, role, passwordVersion: user.passwordVersion || 0 },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ 
    token, 
    user: { 
      id: user.id, 
      username: user.username, 
      role, 
      email: user.email, 
      avatar: user.avatar,
      googleId: user.googleId,
      isGoogleUser: true 
    } 
  });
};
