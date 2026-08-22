import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { motion } from "framer-motion";
import { Shield, User, Trash2, Layout, Upload, RefreshCw, Key, CheckCircle2, AlertCircle, Globe, Sparkles, ExternalLink, Package, Puzzle, Power, Database, Users, Palette, Rocket, Ban } from "lucide-react";
import { ImageCropper } from "../components/ImageCropper";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { initializeApp, deleteApp, getApps } from "firebase/app";
import { useNotification } from "../context/NotificationContext";

export default function SettingsPage() {
  const { notify } = useNotification();
  const { user, logout, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"database" | "personalization" | "extensions" | "eggs" | "playit" | "users">("database");
  const { 
    panelName, panelLogo, panelBackgroundImage, panelBackgroundBlur, 
    enablePlayit, enableTutorial, enableLoginAnimation, enableRegistration, theme, 
    enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId, 
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId, 
    fetchSettings 
  } = useSettings();
  
  const [users, setUsers] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  // Username Change State
  const [newCustomUsername, setNewCustomUsername] = useState(user?.username || "");
  const [isChangingUsername, setIsChangingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [newEmail, setNewEmail] = useState(user?.email || "");
  const [emailPassword, setEmailPassword] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (user?.username) {
      setNewCustomUsername(user.username);
    }
  }, [user?.username]);

  const isDevPort3000 = typeof window !== "undefined" && (
    window.location.port === "3000" || 
    window.location.hostname === "localhost" || 
    window.location.hostname === "127.0.0.1"
  );

  const handleChangeUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomUsername || newCustomUsername.trim().length < 3) {
      setUsernameMsg({ text: "Username must be at least 3 characters", type: "error" });
      return;
    }
    setIsChangingUsername(true);
    setUsernameMsg(null);
    try {
      const res = await axios.put("/api/auth/username", { newUsername: newCustomUsername.trim() });
      if (updateUser) {
        updateUser({ username: res.data.username });
      }
      setUsernameMsg({ text: "Username updated successfully!", type: "success" });
      if (user.role === "admin") {
        fetchUsers();
      }
    } catch (err: any) {
      setUsernameMsg({ text: err.response?.data?.error || "Failed to update username", type: "error" });
    } finally {
      setIsChangingUsername(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setEmailMsg({ text: "Please enter a valid email address", type: "error" });
      return;
    }
    setIsChangingEmail(true);
    setEmailMsg(null);
    try {
      const res = await axios.put("/api/auth/email", { newEmail: cleanEmail, password: emailPassword });
      if (updateUser) {
        updateUser({ email: res.data.email });
      }
      setEmailPassword("");
      setEmailMsg({ text: "Email updated successfully!", type: "success" });
    } catch (err: any) {
      setEmailMsg({ text: err.response?.data?.error || "Failed to update email", type: "error" });
    } finally {
      setIsChangingEmail(false);
    }
  };
  const [newPanelName, setNewPanelName] = useState(panelName);
  const [newEnablePlayit, setNewEnablePlayit] = useState(enablePlayit);

  // ---- Cloudflare Tunnel custom domain ----
  const [cfDomain, setCfDomain] = useState("");
  const [cfApiToken, setCfApiToken] = useState("");
  const [cfAccountId, setCfAccountId] = useState("");
  const [cfTunnelId, setCfTunnelId] = useState("");
  const [cfNoTlsVerify, setCfNoTlsVerify] = useState(true);
  const [isSavingCf, setIsSavingCf] = useState(false);
  const [isConnectingCf, setIsConnectingCf] = useState(false);
  const [cfMsg, setCfMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchCloudflareSettings = async () => {
    try {
      const res = await axios.get("/api/system/cloudflare");
      setCfDomain(res.data.cloudflareDomain || "");
      setCfApiToken(res.data.cloudflareApiToken || "");
      setCfAccountId(res.data.cloudflareAccountId || "");
      setCfTunnelId(res.data.cloudflareTunnelId || "");
      setCfNoTlsVerify(res.data.cloudflareNoTlsVerify !== false);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user?.role === "admin") fetchCloudflareSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleConnectCloudflareDomain = async () => {
    setIsSavingCf(true);
    setCfMsg(null);
    try {
      await axios.put("/api/system/settings", {
        cloudflareDomain: cfDomain.trim(),
        cloudflareApiToken: cfApiToken.trim(),
        cloudflareAccountId: cfAccountId.trim(),
        cloudflareTunnelId: cfTunnelId.trim(),
        cloudflareNoTlsVerify: cfNoTlsVerify,
      });
      setIsSavingCf(false);
      setIsConnectingCf(true);
      const res = await axios.post("/api/system/cloudflare/connect");
      setCfMsg({ text: res.data.message, type: res.data.dnsConfigured ? "success" : "error" });
    } catch (err: any) {
      setCfMsg({ text: err.response?.data?.error || "Failed to connect domain.", type: "error" });
    } finally {
      setIsSavingCf(false);
      setIsConnectingCf(false);
    }
  };
  const [newEnableTutorial, setNewEnableTutorial] = useState(enableTutorial);
  const [newEnableLoginAnimation, setNewEnableLoginAnimation] = useState(enableLoginAnimation);
  const [newEnableRegistration, setNewEnableRegistration] = useState(enableRegistration);
  const [newTheme, setNewTheme] = useState(theme);

  // Firebase Config Local State
  const [fbEnableGoogleLogin, setFbEnableGoogleLogin] = useState<boolean>(enableGoogleLogin || false);
  const [fbApiKey, setFbApiKey] = useState<string>(firebaseApiKey || "");
  const [fbAuthDomain, setFbAuthDomain] = useState<string>(firebaseAuthDomain || "");
  const [fbProjectId, setFbProjectId] = useState<string>(firebaseProjectId || "");
  const [fbStorageBucket, setFbStorageBucket] = useState<string>(firebaseStorageBucket || "");
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState<string>(firebaseMessagingSenderId || "");
  const [fbAppId, setFbAppId] = useState<string>(firebaseAppId || "");
  const [isSavingFirebase, setIsSavingFirebase] = useState(false);
  const [fbStatusMsg, setFbStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [croppingType, setCroppingType] = useState<"logo" | "background" | null>(null);
  const [bgAspectRatio, setBgAspectRatio] = useState<number>(16/9);
  const [tempBgBlur, setTempBgBlur] = useState<number>(10);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [adminUserNewPassword, setAdminUserNewPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Two-Factor Authentication (TOTP) state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(!!user?.twoFactorEnabled);
  const [twoFactorSetupData, setTwoFactorSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState("");
  const [twoFactorDisablePassword, setTwoFactorDisablePassword] = useState("");
  const [twoFactorDisableCode, setTwoFactorDisableCode] = useState("");
  const [showTwoFactorDisableForm, setShowTwoFactorDisableForm] = useState(false);
  const [isTwoFactorBusy, setIsTwoFactorBusy] = useState(false);
  const [twoFactorMsg, setTwoFactorMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setTwoFactorEnabled(!!user?.twoFactorEnabled);
  }, [user?.twoFactorEnabled]);

  const handleStartTwoFactorSetup = async () => {
    setIsTwoFactorBusy(true);
    setTwoFactorMsg(null);
    try {
      const res = await axios.post("/api/auth/2fa/setup");
      setTwoFactorSetupData({ secret: res.data.secret, qrCode: res.data.qrCode });
    } catch (err: any) {
      setTwoFactorMsg({ text: err.response?.data?.error || "Failed to start 2FA setup", type: "error" });
    } finally {
      setIsTwoFactorBusy(false);
    }
  };

  const handleConfirmTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTwoFactorBusy(true);
    setTwoFactorMsg(null);
    try {
      await axios.post("/api/auth/2fa/confirm", { code: twoFactorSetupCode });
      setTwoFactorEnabled(true);
      setTwoFactorSetupData(null);
      setTwoFactorSetupCode("");
      if (updateUser) updateUser({ twoFactorEnabled: true });
      setTwoFactorMsg({ text: "Two-factor authentication is now enabled.", type: "success" });
    } catch (err: any) {
      setTwoFactorMsg({ text: err.response?.data?.error || "Invalid code", type: "error" });
    } finally {
      setIsTwoFactorBusy(false);
    }
  };

  const handleDisableTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTwoFactorBusy(true);
    setTwoFactorMsg(null);
    try {
      await axios.post("/api/auth/2fa/disable", { password: twoFactorDisablePassword, code: twoFactorDisableCode });
      setTwoFactorEnabled(false);
      setShowTwoFactorDisableForm(false);
      setTwoFactorDisablePassword("");
      setTwoFactorDisableCode("");
      if (updateUser) updateUser({ twoFactorEnabled: false });
      setTwoFactorMsg({ text: "Two-factor authentication has been disabled.", type: "success" });
    } catch (err: any) {
      setTwoFactorMsg({ text: err.response?.data?.error || "Failed to disable 2FA", type: "error" });
    } finally {
      setIsTwoFactorBusy(false);
    }
  };

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isUpdatingLogo, setIsUpdatingLogo] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUpdatingSystem, setIsUpdatingSystem] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSystemUpdate = async () => {
    try {
      setIsUpdatingSystem(true);
      await axios.post("/api/system/update");
      setIsUpdatingSystem(false);
    } catch (e) {
      notify("Failed to update system. Please check logs.");
      setIsUpdatingSystem(false);
    }
  };

  useEffect(() => {
    setNewPanelName(panelName);
    setNewEnablePlayit(enablePlayit);
    setNewEnableTutorial(enableTutorial);
    setNewEnableLoginAnimation(enableLoginAnimation);
    setNewEnableRegistration(enableRegistration);
    setNewTheme(theme);
    setFbEnableGoogleLogin(enableGoogleLogin || false);
    setFbApiKey(firebaseApiKey || "");
    setFbAuthDomain(firebaseAuthDomain || "");
    setFbProjectId(firebaseProjectId || "");
    setFbStorageBucket(firebaseStorageBucket || "");
    setFbMessagingSenderId(firebaseMessagingSenderId || "");
    setFbAppId(firebaseAppId || "");
  }, [panelName, enablePlayit, enableTutorial, enableLoginAnimation, enableRegistration, theme, enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId, firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId]);

  const handleSaveFirebaseSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingFirebase(true);
    setFbStatusMsg(null);
    try {
      await axios.put("/api/system/settings", {
        enableGoogleLogin: fbEnableGoogleLogin,
        firebaseApiKey: fbApiKey,
        firebaseAuthDomain: fbAuthDomain,
        firebaseProjectId: fbProjectId,
        firebaseStorageBucket: fbStorageBucket,
        firebaseMessagingSenderId: fbMessagingSenderId,
        firebaseAppId: fbAppId
      });
      await fetchSettings();
      setFbStatusMsg({ text: "Firebase & Google Login settings saved successfully!", type: "success" });
    } catch (err: any) {
      setFbStatusMsg({ text: err.response?.data?.error || "Failed to save Firebase config", type: "error" });
    } finally {
      setIsSavingFirebase(false);
    }
  };

  const handleTestFirebaseConfig = async () => {
    setFbStatusMsg(null);
    if (!fbApiKey || !fbProjectId) {
      setFbStatusMsg({ text: "Please enter at least API Key and Project ID to test.", type: "error" });
      return;
    }
    try {
      const testAppName = "test-fb-app-" + Date.now();
      const testApp = initializeApp({
        apiKey: fbApiKey,
        authDomain: fbAuthDomain,
        projectId: fbProjectId,
        storageBucket: fbStorageBucket,
        messagingSenderId: fbMessagingSenderId,
        appId: fbAppId
      }, testAppName);
      
      await deleteApp(testApp);
      setFbStatusMsg({ text: "Firebase Configuration verified valid!", type: "success" });
    } catch (err: any) {
      setFbStatusMsg({ text: "Firebase config error: " + (err.message || String(err)), type: "error" });
    }
  };

  const fetchUsers = async () => {
    if (user.role !== "admin") return;
    try {
      const res = await axios.get("/api/system/users");
      setUsers(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchUsers();
    fetchBannedIps();
    if (panelBackgroundBlur !== undefined) setTempBgBlur(panelBackgroundBlur);
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "logo" | "background" = "logo") => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', async () => {
        const base64 = reader.result?.toString() || null;
        if (base64) {
          if (type === "logo") {
            setSelectedImage(base64);
            setCroppingType(type);
          } else if (type === "background") {
            setIsProcessing(true);
            try {
              await axios.put("/api/system/settings", { panelBackgroundImage: base64 });
              await fetchSettings();
            } catch(err) {
              console.error(err);
            } finally {
              setIsProcessing(false);
            }
          }
        }
      });
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (bgFileInputRef.current) bgFileInputRef.current.value = "";
  };

  const handleCropComplete = async (croppedImageBase64: string) => {
    const type = croppingType;
    setSelectedImage(null);
    setCroppingType(null);
    if (type === "logo") {
      setIsUpdatingLogo(true);
      try {
        await axios.put("/api/system/settings", { panelLogo: croppedImageBase64 });
        await fetchSettings();
      } catch (err: any) {
        notify(err.response?.data?.error || "Error updating logo");
      } finally {
        setIsUpdatingLogo(false);
      }
    } else if (type === "background") {
      setIsProcessing(true);
      try {
        await axios.put("/api/system/settings", { panelBackgroundImage: croppedImageBase64 });
        await fetchSettings();
      } catch (err: any) {
        notify(err.response?.data?.error || "Error updating background");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      await axios.post("/api/system/users", { username, password, role });
      setUsername("");
      setPassword("");
      fetchUsers();
      notify("User created successfully");
    } catch (e: any) {
      notify(e.response?.data?.error || "Error creating user");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const changeUserPassword = async (id: string) => {
    try {
      if (adminUserNewPassword.length < 8) {
         notify("Password must be at least 8 characters");
         return;
      }
      await axios.put(`/api/system/users/${id}/password`, { newPassword: adminUserNewPassword });
      notify("Password changed successfully");
      setEditingUserId(null);
      setAdminUserNewPassword("");
      if (user.id === id) {
        logout();
      }
    } catch(e: any) {
      notify(e.response?.data?.error || "Error changing password");
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Delete this user account permanently? This cannot be undone.")) return;
    try {
      await axios.delete(`/api/system/users/${id}`);
      fetchUsers();
    } catch (e) {}
  };

  const terminateUserSession = async (id: string, username: string) => {
    if (!confirm(`Force-logout "${username}" everywhere? Their current session token(s) will stop working immediately.`)) return;
    try {
      await axios.post(`/api/system/users/${id}/terminate`);
      notify(`${username}'s sessions have been terminated.`);
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to terminate session");
    }
  };

  const [bannedIps, setBannedIps] = useState<any[]>([]);
  const fetchBannedIps = async () => {
    try {
      const res = await axios.get("/api/system/banned-ips");
      setBannedIps(res.data);
    } catch (e) {}
  };

  const banUserIp = async (id: string, username: string) => {
    if (!confirm(`Ban the last known IP address for "${username}"? They (and anyone else on that IP) won't be able to reach the panel until unbanned.`)) return;
    try {
      const res = await axios.post(`/api/system/users/${id}/ban-ip`);
      notify(`Banned IP ${res.data.ip}.`);
      fetchBannedIps();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to ban IP");
    }
  };

  const unbanIpAddress = async (ip: string) => {
    if (!confirm(`Unban ${ip}?`)) return;
    try {
      await axios.delete(`/api/system/banned-ips/${encodeURIComponent(ip)}`);
      fetchBannedIps();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to unban IP");
    }
  };

  // ---- Eggs (server templates) ----
  const [eggs, setEggs] = useState<any[]>([]);
  const [eggUploadMsg, setEggUploadMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isUploadingEgg, setIsUploadingEgg] = useState(false);
  const eggFileInputRef = useRef<HTMLInputElement>(null);

  const fetchEggs = async () => {
    if (user.role !== "admin") return;
    try {
      const res = await axios.get("/api/eggs");
      setEggs(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchEggs();
  }, [user]);

  const handleEggFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingEgg(true);
    setEggUploadMsg(null);
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        await axios.post("/api/eggs", parsed);
        setEggUploadMsg({ text: `Egg "${parsed.name}" uploaded successfully!`, type: "success" });
        fetchEggs();
      } catch (err: any) {
        setEggUploadMsg({ text: err.response?.data?.error || "Invalid egg file — must be valid JSON with at least name + dockerImage.", type: "error" });
      } finally {
        setIsUploadingEgg(false);
        if (eggFileInputRef.current) eggFileInputRef.current.value = "";
      }
    });
    reader.readAsText(file);
  };

  const deleteEgg = async (id: string) => {
    try {
      await axios.delete(`/api/eggs/${id}`);
      fetchEggs();
    } catch (e) {}
  };

  // ---- Databases (MySQL host managed by the panel) ----
  const [databases, setDatabases] = useState<any[]>([]);
  const [dbHostStatus, setDbHostStatus] = useState<{ running: boolean; host: string; port: number } | null>(null);
  const [newDbName, setNewDbName] = useState("");
  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [isStartingDbHost, setIsStartingDbHost] = useState(false);
  const [dbMsg, setDbMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [revealedDbId, setRevealedDbId] = useState<string | null>(null);

  const fetchDatabases = async () => {
    try {
      const res = await axios.get("/api/databases");
      setDatabases(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchDbHostStatus = async () => {
    try {
      const res = await axios.get("/api/databases/host/status");
      setDbHostStatus(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchDatabases();
      fetchDbHostStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleStartDbHost = async () => {
    setIsStartingDbHost(true);
    setDbMsg(null);
    try {
      await axios.post("/api/databases/host/start");
      await fetchDbHostStatus();
      setDbMsg({ text: "Database host is starting up.", type: "success" });
    } catch (err: any) {
      setDbMsg({ text: err.response?.data?.error || "Failed to start database host.", type: "error" });
    } finally {
      setIsStartingDbHost(false);
    }
  };

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) return;
    setIsCreatingDb(true);
    setDbMsg(null);
    try {
      await axios.post("/api/databases", { name: newDbName.trim() });
      setNewDbName("");
      await fetchDatabases();
      setDbMsg({ text: "Database created.", type: "success" });
    } catch (err: any) {
      setDbMsg({ text: err.response?.data?.error || "Failed to create database.", type: "error" });
    } finally {
      setIsCreatingDb(false);
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    if (!confirm("Delete this database and its user? This cannot be undone.")) return;
    try {
      await axios.delete(`/api/databases/${id}`);
      fetchDatabases();
    } catch (err) { console.error(err); }
  };

  // ---- Extensions (Minecraft-only panel modules) ----
  const [extensions, setExtensions] = useState<any[]>([]);
  const [extUploadMsg, setExtUploadMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isUploadingExt, setIsUploadingExt] = useState(false);
  const extFileInputRef = useRef<HTMLInputElement>(null);

  const fetchExtensions = async () => {
    if (user.role !== "admin") return;
    try {
      const res = await axios.get("/api/extensions");
      setExtensions(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchExtensions();
  }, [user]);

  const handleExtFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingExt(true);
    setExtUploadMsg(null);
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        await axios.post("/api/extensions", parsed);
        setExtUploadMsg({ text: `Extension "${parsed.name}" uploaded successfully!`, type: "success" });
        fetchExtensions();
      } catch (err: any) {
        setExtUploadMsg({ text: err.response?.data?.error || "Invalid extension file.", type: "error" });
      } finally {
        setIsUploadingExt(false);
        if (extFileInputRef.current) extFileInputRef.current.value = "";
      }
    });
    reader.readAsText(file);
  };

  const toggleExtension = async (id: string) => {
    try {
      await axios.put(`/api/extensions/${id}/toggle`);
      fetchExtensions();
    } catch (e) {}
  };

  const deleteExtension = async (id: string) => {
    try {
      await axios.delete(`/api/extensions/${id}`);
      fetchExtensions();
    } catch (e) {}
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full relative z-10"
    >
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground mb-2 drop-shadow-lg">Settings</h1>
        <p className="text-theme-400/80 font-bold uppercase tracking-widest text-sm mt-2">Manage your account, password, email and two-factor authentication.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {false && (
          <nav className="w-full lg:w-60 flex-shrink-0 bg-black/40 dark:bg-black/40 backdrop-blur-2xl border border-border rounded-3xl p-3 shadow-[0_0_50px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle lg:sticky lg:top-6">
            <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible">
              {[
                { key: "database", label: "Database", icon: <Database size={17} /> },
                { key: "personalization", label: "Personalization", icon: <Palette size={17} /> },
                { key: "extensions", label: "Extensions", icon: <Puzzle size={17} /> },
                { key: "eggs", label: "Egg Upload", icon: <Package size={17} /> },
                { key: "playit", label: "Playit Tunnel", icon: <Rocket size={17} /> },
                { key: "users", label: "Users", icon: <Users size={17} /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all w-full text-left ${
                    activeTab === tab.key
                      ? "bg-theme-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.35)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </nav>
        )}

        <div className="flex-1 min-w-0 w-full">

      <div className="bg-black/40 dark:bg-black/40 backdrop-blur-2xl border border-border rounded-3xl p-6 md:p-10 mb-8 shadow-[0_0_50px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-theme-500/5 blur-[80px] rounded-full pointer-events-none" />
        
        <h2 className="text-xl font-bold mb-6 flex items-center text-foreground relative z-10">
          <User className="mr-3 text-theme-400 w-5 h-5" /> Account Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10 mb-8">
          <div className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border p-5 rounded-2xl shadow-[0_0_30px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle">
            <p className="text-sm font-medium text-muted-foreground mb-1">Username</p>
            <p className="text-lg font-semibold text-foreground-muted">{user.username}</p>
          </div>
          <div className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border p-5 rounded-2xl shadow-[0_0_30px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle">
            <p className="text-sm font-medium text-muted-foreground mb-1">Access Role</p>
            <p className="text-lg font-semibold text-foreground-muted capitalize flex items-center gap-2">
              {user.role}
              {user.role === 'admin' && <Shield size={14} className="text-purple-400" />}
            </p>
          </div>
        </div>

        {(user.isGoogleUser || user.googleId) && (
          <div className="relative z-10 border-t border-border-subtle pt-6 mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-3">Change Display Username</h3>
            {usernameMsg && (
              <div className={`p-3.5 rounded-xl mb-4 flex items-center gap-2.5 text-sm font-medium ${usernameMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                {usernameMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{usernameMsg.text}</span>
              </div>
            )}
            <form onSubmit={handleChangeUsername} className="max-w-md">
              <div className="flex gap-3">
                <input 
                  required 
                  minLength={3}
                  value={newCustomUsername} 
                  onChange={e => setNewCustomUsername(e.target.value)} 
                  type="text" 
                  placeholder="Enter new username"
                  className="flex-1 bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" 
                />
                <button 
                  type="submit" 
                  disabled={isChangingUsername || user.username === "admin" || newCustomUsername.trim() === user.username}
                  className="bg-theme-500 hover:bg-theme-600 disabled:opacity-50 text-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98] whitespace-nowrap"
                >
                  {isChangingUsername ? "Saving..." : "Save Username"}
                </button>
              </div>
            </form>
            <p className="text-xs text-amber-400/90 mt-2">
              Google Authenticated Users can update their display username at any time without impacting their Google login credentials.
            </p>
          </div>
        )}

        <div className="relative z-10 border-t border-border-subtle pt-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Change Password</h3>
          {user.isGoogleUser || user.googleId ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-medium flex items-center gap-3 max-w-md">
              <Shield size={20} className="text-amber-400 flex-shrink-0" />
              <span>Password change is disabled because you signed in with your Google account.</span>
            </div>
          ) : (
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (newPassword.length < 8) {
                  notify("Password must be at least 8 characters");
                  return;
                }
                setIsChangingPassword(true);
                try {
                  await axios.put("/api/auth/password", { oldPassword, newPassword });
                  setOldPassword("");
                  setNewPassword("");
                  notify("Password changed successfully. You will be logged out.");
                  logout();
                } catch (err: any) {
                  notify(err.response?.data?.error || "Error changing password");
                } finally {
                  setIsChangingPassword(false);
                }
              }}
              className="max-w-md"
            >
              <div className="flex flex-col gap-3">
                <input 
                  required 
                  value={oldPassword} 
                  onChange={e => setOldPassword(e.target.value)} 
                  type="password" 
                  placeholder="Current password"
                  className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" 
                />
                <div className="flex gap-3">
                  <input 
                    required 
                    minLength={8}
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)} 
                    type="password" 
                    placeholder="New password (min 8 chars)"
                    className="flex-1 bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" 
                  />
                  <button 
                    type="submit" 
                    disabled={isChangingPassword}
                    className="bg-theme-500 hover:bg-theme-600 disabled:opacity-50 text-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98] whitespace-nowrap"
                  >
                    {isChangingPassword ? "Updating..." : "Update"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="relative z-10 border-t border-border-subtle pt-6 mt-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Change Email</h3>
          {emailMsg && (
            <div className={`p-3.5 rounded-xl mb-4 flex items-center gap-2.5 text-sm font-medium max-w-md ${emailMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {emailMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{emailMsg.text}</span>
            </div>
          )}
          <form onSubmit={handleChangeEmail} className="max-w-md">
            <div className="flex flex-col gap-3">
              <input
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                type="email"
                placeholder="Email address"
                className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
              />
              {!(user.isGoogleUser || user.googleId) && (
                <div className="flex gap-3">
                  <input
                    required
                    value={emailPassword}
                    onChange={e => setEmailPassword(e.target.value)}
                    type="password"
                    placeholder="Current password to confirm"
                    className="flex-1 bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isChangingEmail}
                    className="bg-theme-500 hover:bg-theme-600 disabled:opacity-50 text-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98] whitespace-nowrap"
                  >
                    {isChangingEmail ? "Updating..." : "Update"}
                  </button>
                </div>
              )}
              {(user.isGoogleUser || user.googleId) && (
                <button
                  type="submit"
                  disabled={isChangingEmail}
                  className="bg-theme-500 hover:bg-theme-600 disabled:opacity-50 text-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98] whitespace-nowrap self-start"
                >
                  {isChangingEmail ? "Updating..." : "Update Email"}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="relative z-10 border-t border-border-subtle pt-6 mt-6">
          <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <Shield size={18} className="text-theme-400" /> Two-Factor Authentication
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Require a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) in addition to your password.
          </p>

          {twoFactorMsg && (
            <div className={`p-3 rounded-xl border text-sm font-medium mb-4 max-w-md flex items-center gap-2 ${
              twoFactorMsg.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}>
              {twoFactorMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {twoFactorMsg.text}
            </div>
          )}

          {user.username === "admin" ? (
            <p className="text-xs text-amber-400/90 max-w-md">
              You're on the built-in default admin account. It's still recommended to create a dedicated
              named admin user for daily use, but 2FA can be enabled here too.
            </p>
          ) : null}

          {twoFactorEnabled ? (
            <div className="max-w-md">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center gap-3 mb-4">
                <CheckCircle2 size={20} className="flex-shrink-0" />
                <span>Two-factor authentication is enabled on your account.</span>
              </div>

              {!showTwoFactorDisableForm ? (
                <button
                  onClick={() => setShowTwoFactorDisableForm(true)}
                  className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-semibold px-5 py-2.5 rounded-xl transition-all"
                >
                  Disable 2FA
                </button>
              ) : (
                <form onSubmit={handleDisableTwoFactor} className="flex flex-col gap-3">
                  <input
                    required
                    value={twoFactorDisablePassword}
                    onChange={(e) => setTwoFactorDisablePassword(e.target.value)}
                    type="password"
                    placeholder="Current password"
                    className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
                  />
                  <input
                    required
                    value={twoFactorDisableCode}
                    onChange={(e) => setTwoFactorDisableCode(e.target.value)}
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
                  />
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isTwoFactorBusy}
                      className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl transition-all active:scale-[0.98] whitespace-nowrap"
                    >
                      {isTwoFactorBusy ? "Disabling..." : "Confirm Disable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTwoFactorDisableForm(false)}
                      className="px-6 py-2.5 rounded-xl border border-border-subtle text-muted-foreground hover:text-foreground transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : twoFactorSetupData ? (
            <form onSubmit={handleConfirmTwoFactor} className="max-w-md flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-muted border border-border-subtle flex flex-col items-center gap-3">
                <img src={twoFactorSetupData.qrCode} alt="2FA QR Code" className="w-44 h-44 rounded-lg bg-white p-2" />
                <p className="text-xs text-muted-foreground text-center">
                  Scan with your authenticator app, or enter this key manually:
                </p>
                <code className="text-xs bg-background border border-border-subtle rounded-lg px-3 py-1.5 text-foreground break-all select-all">
                  {twoFactorSetupData.secret}
                </code>
              </div>
              <input
                required
                value={twoFactorSetupCode}
                onChange={(e) => setTwoFactorSetupCode(e.target.value)}
                type="text"
                inputMode="numeric"
                autoFocus
                placeholder="Enter the 6-digit code to confirm"
                className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isTwoFactorBusy}
                  className="bg-theme-500 hover:bg-theme-600 disabled:opacity-50 text-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98] whitespace-nowrap"
                >
                  {isTwoFactorBusy ? "Confirming..." : "Confirm & Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => { setTwoFactorSetupData(null); setTwoFactorSetupCode(""); }}
                  className="px-6 py-2.5 rounded-xl border border-border-subtle text-muted-foreground hover:text-foreground transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={handleStartTwoFactorSetup}
              disabled={isTwoFactorBusy}
              className="bg-theme-500 hover:bg-theme-600 disabled:opacity-50 text-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] active:scale-[0.98] whitespace-nowrap flex items-center gap-2"
            >
              <Shield size={16} /> {isTwoFactorBusy ? "Starting..." : "Enable Two-Factor Authentication"}
            </button>
          )}
        </div>
      </div>

      {false && activeTab === "database" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border-subtle pb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center text-foreground">
                <Database className="mr-3 text-theme-400 w-6 h-6" /> Database
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Create MySQL databases (e.g. for plugins like LuckPerms) backed by a MySQL container the panel manages for you.
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted-subtle border border-border-subtle">
              <span className={`w-2.5 h-2.5 rounded-full ${dbHostStatus?.running ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="text-xs font-semibold text-foreground">
                {dbHostStatus?.running ? `Host online — ${dbHostStatus.host}:${dbHostStatus.port}` : "Host offline"}
              </span>
              {!dbHostStatus?.running && (
                <button
                  onClick={handleStartDbHost}
                  disabled={isStartingDbHost}
                  className="ml-2 px-3 py-1 text-xs font-semibold bg-theme-500 hover:bg-theme-400 text-white rounded-lg transition-all disabled:opacity-50"
                >
                  {isStartingDbHost ? "Starting..." : "Start Host"}
                </button>
              )}
            </div>
          </div>

          {dbMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${dbMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {dbMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{dbMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleCreateDatabase} className="flex flex-col sm:flex-row gap-3 mb-8">
            <input
              required
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              type="text"
              placeholder="Database name (e.g. luckperms)"
              className="flex-1 bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
            />
            <button
              disabled={isCreatingDb}
              type="submit"
              className="bg-theme-500 hover:bg-theme-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] whitespace-nowrap disabled:opacity-50"
            >
              {isCreatingDb ? "Creating..." : "Create Database"}
            </button>
          </form>

          <div className="space-y-3">
            {databases.length === 0 && (
              <p className="text-sm text-muted-foreground">No databases created yet.</p>
            )}
            {databases.map((db: any) => (
              <div key={db.id} className="p-4 bg-muted-subtle border border-border-subtle rounded-xl">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-foreground text-sm">{db.dbName}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{db.host}:{db.port}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRevealedDbId(revealedDbId === db.id ? null : db.id)}
                      className="px-3 py-1.5 text-xs font-medium text-theme-400 bg-theme-500/10 hover:bg-theme-500/20 rounded-lg transition-colors"
                    >
                      {revealedDbId === db.id ? "Hide Credentials" : "Show Credentials"}
                    </button>
                    <button onClick={() => handleDeleteDatabase(db.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete database">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {revealedDbId === db.id && (
                  <div className="mt-3 pt-3 border-t border-border-subtle grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
                    <div>Host: <span className="text-foreground">{db.host}</span></div>
                    <div>Port: <span className="text-foreground">{db.port}</span></div>
                    <div>Database: <span className="text-foreground">{db.dbName}</span></div>
                    <div>Username: <span className="text-foreground">{db.dbUser}</span></div>
                    <div className="col-span-2">Password: <span className="text-foreground">{db.dbPassword}</span></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {false && activeTab === "personalization" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 relative z-10">
          
          {/* Branding & Identity */}
          <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 flex items-center text-foreground">
              <Layout className="mr-3 text-theme-400 w-5 h-5" /> Branding & Identity
            </h2>
            <div className="flex flex-col gap-8">
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsSavingSettings(true);
                  try {
                    await axios.put("/api/system/settings", { panelName: newPanelName });
                    fetchSettings();
                  } catch (err: any) {
                    notify(err.response?.data?.error || "Error updating settings");
                  } finally {
                    setIsSavingSettings(false);
                  }
                }}
              >
                <label className="block text-sm font-medium text-muted-foreground mb-2">Panel Name</label>
                <div className="flex gap-3">
                  <input 
                    required 
                    value={newPanelName} 
                    onChange={e => setNewPanelName(e.target.value)} 
                    type="text" 
                    placeholder="Enter panel name"
                  />
                  <button disabled={isSavingSettings} type="submit" className="bg-theme-600 hover:bg-theme-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] whitespace-nowrap disabled:opacity-50">
                    {isSavingSettings ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-3">Panel Logo</label>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-muted border border-border-subtle flex items-center justify-center overflow-hidden flex-shrink-0 relative group shadow-inner">
                    {panelLogo ? (
                      <img src={panelLogo} alt="Panel Logo" className="w-full h-full object-cover" />
                    ) : (
                      <Layout className="w-8 h-8 text-muted-foreground/50" />
                    )}
                    {panelLogo && (
                      <button 
                        onClick={async () => {
                          try {
                            await axios.put("/api/system/settings", { panelLogo: "" });
                            fetchSettings();
                          } catch(e) {}
                        }}
                        className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                        title="Remove logo"
                      >
                        <Trash2 size={20} className="text-white" />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex-1 w-full text-center sm:text-left">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={(e) => handleFileChange(e, "logo")}
                    />
                    <button 
                      disabled={isUpdatingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 bg-muted hover:bg-muted-hover text-foreground border border-border font-medium px-5 py-2.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 w-full sm:w-auto mb-2"
                    >
                      {isUpdatingLogo ? <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-foreground animate-spin"></div> : <Upload size={18} />}
                      {isUpdatingLogo ? "Uploading..." : (panelLogo ? "Replace Logo" : "Upload Logo")}
                    </button>
                    <p className="text-xs text-muted-foreground">We recommend a square image, PNG or JPG format, at least 256x256px.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Features */}
          <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 flex items-center text-foreground">
              <RefreshCw className="mr-3 text-emerald-400 w-5 h-5" /> Platform Features
            </h2>
            <div className="flex flex-col gap-6">
              
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/50 border border-border-subtle">
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Onboarding Tutorial</h3>
                  <p className="text-xs text-muted-foreground mt-1">Show a guided tour to new users when they log in for the first time.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input 
                    type="checkbox" 
                    checked={newEnableTutorial} 
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setNewEnableTutorial(val);
                      try {
                        await axios.put("/api/system/settings", { enableTutorial: val });
                        fetchSettings();
                      } catch (err) { console.error(err); }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/50 border border-border-subtle">
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Cinematic Login Intro</h3>
                  <p className="text-xs text-muted-foreground mt-1">Enable the animated sequence on the login screen.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input 
                    type="checkbox" 
                    checked={newEnableLoginAnimation} 
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setNewEnableLoginAnimation(val);
                      try {
                        await axios.put("/api/system/settings", { enableLoginAnimation: val });
                        fetchSettings();
                      } catch (err) { console.error(err); }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/50 border border-border-subtle">
                <div>
                  <h3 className="font-semibold text-foreground text-sm">User Registration</h3>
                  <p className="text-xs text-muted-foreground mt-1">Allow new users to register an account on the panel.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                  <input 
                    type="checkbox" 
                    checked={newEnableRegistration} 
                    onChange={async (e) => {
                      const val = e.target.checked;
                      setNewEnableRegistration(val);
                      try {
                        await axios.put("/api/system/settings", { enableRegistration: val });
                        fetchSettings();
                      } catch (err) { console.error(err); }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

            </div>
          </div>
        </div>
      )}

      {false && activeTab === "playit" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <h2 className="text-xl font-bold mb-6 flex items-center text-foreground">
            <Rocket className="mr-3 text-emerald-400 w-5 h-5" /> Playit Tunnel Integration
          </h2>
          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/50 border border-border-subtle">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Enable Playit Tunnels</h3>
              <p className="text-xs text-muted-foreground mt-1">Allow users to expose their local servers to the internet using playit.gg tunnels.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
              <input
                type="checkbox"
                checked={newEnablePlayit}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setNewEnablePlayit(val);
                  try {
                    await axios.put("/api/system/settings", { enablePlayit: val });
                    fetchSettings();
                  } catch (err) { console.error(err); }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>
      )}

      {false && activeTab === "playit" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center text-foreground">
            <Globe className="mr-3 text-orange-400 w-5 h-5" /> Cloudflare Tunnel — Custom Domain
          </h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            First connect the tunnel with your <span className="font-semibold text-foreground">Tunnel Token</span> (done once, during install — Zero Trust → Networks → Tunnels → your tunnel → "Configure" → copy the token). Then use the fields below (a separate <span className="font-semibold text-foreground">Cloudflare API Token</span> with Tunnel:Edit + DNS:Edit permissions) to point your domain at this panel over HTTPS.
          </p>

          {cfMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${cfMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {cfMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{cfMsg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Your Domain</label>
              <input value={cfDomain} onChange={(e) => setCfDomain(e.target.value)} type="text" placeholder="panel.example.com" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Cloudflare API Token</label>
              <input value={cfApiToken} onChange={(e) => setCfApiToken(e.target.value)} type="password" placeholder="API token (Tunnel:Edit, DNS:Edit)" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Account ID</label>
              <input value={cfAccountId} onChange={(e) => setCfAccountId(e.target.value)} type="text" placeholder="Cloudflare account ID" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Tunnel ID</label>
              <input value={cfTunnelId} onChange={(e) => setCfTunnelId(e.target.value)} type="text" placeholder="Tunnel ID (from Zero Trust dashboard)" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 mt-4 rounded-2xl bg-muted/50 border border-border-subtle">
            <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Routed as <span className="font-mono text-foreground">http://localhost:6767</span> (the panel doesn't run its own TLS locally — Cloudflare handles HTTPS for your visitors and connects to the panel over plain HTTP on the same machine).
            </p>
          </div>

          <button
            onClick={handleConnectCloudflareDomain}
            disabled={isSavingCf || isConnectingCf || !cfDomain || !cfApiToken || !cfAccountId || !cfTunnelId}
            className="mt-6 bg-theme-500 hover:bg-theme-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {isConnectingCf ? "Connecting..." : isSavingCf ? "Saving..." : "Connect Domain"}
          </button>
        </div>
      )}

      {false && activeTab === "personalization" && (
        isDevPort3000 ? (
          <div className="bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden mt-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10 border-b border-border-subtle pb-6">
              <div>
                <h2 className="text-xl font-bold flex items-center text-foreground">
                  <Key className="mr-3 text-amber-400 w-6 h-6" /> Google & Firebase Authentication
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure Firebase API Keys to enable 1-click Google Sign-In for admins and users.
                </p>
              </div>
              <div className="flex items-center gap-3 bg-muted p-2 rounded-xl border border-border">
                <span className="text-xs font-semibold text-muted-foreground">Enable Google Login:</span>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input 
                    type="checkbox" 
                    checked={fbEnableGoogleLogin} 
                    onChange={(e) => setFbEnableGoogleLogin(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
            </div>

            {/* Quick Guide Banner */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6 text-xs text-amber-200/90 leading-relaxed">
              <div className="font-bold text-amber-300 text-sm mb-1 flex items-center gap-2">
                <Sparkles size={16} /> How to Setup Google Login in 1 Minute (No Code Needed!):
              </div>
              <ol className="list-decimal list-inside space-y-1 mt-2 text-muted-foreground">
                <li>Open <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-amber-400 underline font-medium hover:text-amber-300 inline-flex items-center gap-1">Firebase Console <ExternalLink size={12} /></a> and create a free project.</li>
                <li>Go to <strong>Authentication &rarr; Sign-in method</strong> and enable <strong>Google</strong>.</li>
                <li>Under <strong>Settings &rarr; Authorized Domains</strong>, add your panel's domain or IP address.</li>
                <li>Go to <strong>Project Settings &rarr; General &rarr; Your apps</strong>, create a Web App and copy the Firebase config credentials below!</li>
              </ol>
            </div>

            {fbStatusMsg && (
              <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${fbStatusMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                {fbStatusMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{fbStatusMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveFirebaseSettings} className="space-y-4 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Firebase API Key <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="AIzaSy..." 
                    value={fbApiKey} 
                    onChange={(e) => setFbApiKey(e.target.value)} 
                    className="w-full bg-muted border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-foreground font-mono transition-all shadow-inner outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Auth Domain <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="your-project.firebaseapp.com" 
                    value={fbAuthDomain} 
                    onChange={(e) => setFbAuthDomain(e.target.value)} 
                    className="w-full bg-muted border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-foreground font-mono transition-all shadow-inner outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Project ID <span className="text-red-400">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="your-project-id" 
                    value={fbProjectId} 
                    onChange={(e) => setFbProjectId(e.target.value)} 
                    className="w-full bg-muted border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-foreground font-mono transition-all shadow-inner outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Storage Bucket (Optional)
                  </label>
                  <input 
                    type="text" 
                    placeholder="your-project.appspot.com" 
                    value={fbStorageBucket} 
                    onChange={(e) => setFbStorageBucket(e.target.value)} 
                    className="w-full bg-muted border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-foreground font-mono transition-all shadow-inner outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Messaging Sender ID (Optional)
                  </label>
                  <input 
                    type="text" 
                    placeholder="1234567890" 
                    value={fbMessagingSenderId} 
                    onChange={(e) => setFbMessagingSenderId(e.target.value)} 
                    className="w-full bg-muted border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-foreground font-mono transition-all shadow-inner outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    App ID (Optional)
                  </label>
                  <input 
                    type="text" 
                    placeholder="1:1234567890:web:abcdef" 
                    value={fbAppId} 
                    onChange={(e) => setFbAppId(e.target.value)} 
                    className="w-full bg-muted border border-border focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-foreground font-mono transition-all shadow-inner outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4">
                <button 
                  type="submit" 
                  disabled={isSavingFirebase}
                  className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  {isSavingFirebase ? "Saving Config..." : "Save Firebase Credentials"}
                </button>

                <button 
                  type="button" 
                  onClick={handleTestFirebaseConfig}
                  className="bg-muted hover:bg-muted/80 border border-border text-foreground font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.98]"
                >
                  Test Connection
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-card/50 border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden mt-8 opacity-80">
            <h2 className="text-xl font-bold flex items-center text-foreground">
              <Key className="mr-3 text-amber-400/70 w-6 h-6" /> Google & Firebase Authentication
            </h2>
            <p className="text-xs text-amber-300/90 mt-3 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
              <span>Google Authentication configuration is restricted to Port 3000 / Development Environment.</span>
            </p>
          </div>
        )
      )}

      {false && activeTab === "personalization" && (
        <div className="bg-muted backdrop-blur-xl border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden mt-8">
          <h2 className="text-xl font-bold mb-8 flex items-center text-foreground relative z-10">
            <Layout className="mr-3 text-theme-400 w-5 h-5" /> Background Configuration
          </h2>
          <div className="max-w-2xl relative z-10">
            <div className="flex flex-col sm:flex-row gap-8">
              <div className="flex-1">
                <label className="block text-sm font-medium text-muted-foreground mb-4">Background Image</label>
                <div className="w-full h-48 rounded-xl bg-muted border border-border flex items-center justify-center overflow-hidden relative group mb-4">
                  {panelBackgroundImage ? (
                    <img src={panelBackgroundImage} alt="Panel Background" className="w-full h-full object-cover" />
                  ) : (
                    <Layout className="w-12 h-12 text-muted-foreground" />
                  )}
                  {panelBackgroundImage && (
                    <button 
                      onClick={async () => {
                        try {
                          await axios.put("/api/system/settings", { panelBackgroundImage: "" });
                          fetchSettings();
                        } catch(e) {}
                      }}
                      className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={24} className="text-foreground" />
                    </button>
                  )}
                </div>
                
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={bgFileInputRef}
                  onChange={(e) => handleFileChange(e, "background")}
                />
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => bgFileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-theme-500/10 hover:bg-theme-500/20 text-theme-400 border border-theme-500/20 font-semibold px-4 py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
                  >
                    <Upload size={18} /> Upload Background Image
                  </button>
                  <button 
                    onClick={async () => {
                      setIsProcessing(true);
                      try {
                        await axios.put("/api/system/settings", { panelBackgroundImage: "" });
                        await fetchSettings();
                      } catch(e) {} finally {
                        setIsProcessing(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-muted hover:bg-muted-hover text-foreground-muted border border-border font-semibold px-4 py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
                  >
                    <Layout size={18} /> Default Theme
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">Will be automatically scaled and cropped to fit 16:9 on desktop and 9:16 on mobile.</p>

              </div>

              <div className="flex-1 flex flex-col justify-center">
                <label className="block text-xs font-bold text-theme-300 uppercase tracking-widest mb-2 drop-shadow-sm">Background Blur: {tempBgBlur}px</label>
                <p className="text-xs text-muted-foreground mb-6">Adjust the blur to make the text and UI elements more readable.</p>
                <input 
                  type="range" 
                  min="0" 
                  max="50" 
                  value={tempBgBlur}
                  onChange={(e) => setTempBgBlur(Number(e.target.value))}
                  onMouseUp={async () => {
                    setIsProcessing(true);
                    try {
                      await axios.put("/api/system/settings", { panelBackgroundBlur: tempBgBlur });
                      await fetchSettings();
                    } catch(e) {} finally {
                      setIsProcessing(false);
                    }
                  }}
                  onTouchEnd={async () => {
                    setIsProcessing(true);
                    try {
                      await axios.put("/api/system/settings", { panelBackgroundBlur: tempBgBlur });
                      await fetchSettings();
                    } catch(e) {} finally {
                      setIsProcessing(false);
                    }
                  }}
                  className="w-full accent-theme-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <ImageCropper
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
          onCancel={() => { setSelectedImage(null); setCroppingType(null); }}
          aspectRatio={croppingType === "background" ? bgAspectRatio : 1}
          title={croppingType === "background" ? "Crop Background" : "Crop Logo"}
        />
      )}

      {false && activeTab === "users" && (
        <div className="bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          <h2 className="text-xl font-bold mb-8 flex items-center text-foreground relative z-10">
            <Shield className="mr-3 text-purple-400 w-5 h-5" /> Administrator Controls
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
            <div className="lg:col-span-4 lg:border-r border-border-subtle lg:pr-8">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-6">Provision Identity</h3>
              <form onSubmit={createUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Username</label>
                  <input required value={username} onChange={e=>setUsername(e.target.value)} type="text" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Password</label>
                  <input required minLength={4} value={password} onChange={e=>setPassword(e.target.value)} type="password" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Role Privileges</label>
                  <select value={role} onChange={e=>setRole(e.target.value)} className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none">
                    <option value="user" className="bg-zinc-900">Standard User</option>
                    <option value="admin" className="bg-zinc-900">Administrator</option>
                  </select>
                </div>
                <button disabled={isCreatingUser} type="submit" className="w-full mt-2 bg-white text-zinc-900 hover:bg-zinc-200 font-semibold py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50">
                  {isCreatingUser ? "Creating..." : "Create Identity"}
                </button>
              </form>
            </div>

            <div className="lg:col-span-8">
               <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-6 flex items-center justify-between">
                <span>Active Identities ({users.length})</span>
              </h3>
               <div className="space-y-3">
                 {users.map(u => (
                   <div key={u.id} className="flex flex-col p-4 bg-muted-subtle border border-border-subtle rounded-xl hover:bg-muted transition-colors">
                      <div className="flex justify-between items-center">
                         <div>
                          <p className="font-medium text-foreground flex items-center gap-2">
                            {u.username}
                            {u.id === user.id && <span className="text-[10px] uppercase font-bold tracking-wider bg-theme-500/20 text-theme-400 px-2.5 py-0.5 rounded border border-theme-500/20">You</span>}
                            {u.isGoogleUser && <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-500/20 text-amber-400 px-2.5 py-0.5 rounded border border-amber-500/20">Google Auth</span>}
                          </p>
                          <p className={`text-xs mt-1 capitalize font-medium ${u.role === 'admin' ? 'text-purple-400' : 'text-muted-foreground'}`}> 
                            Role: {u.role}
                          </p>
                          {u.lastIp && (
                            <p className="text-[11px] mt-1 text-muted-foreground/70 font-mono">Last IP: {u.lastIp}</p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          {u.id !== user.id && !u.isGoogleUser && (
                            <button onClick={() => {
                              if (editingUserId === u.id) {
                                setEditingUserId(null);
                              } else {
                                setEditingUserId(u.id);
                                setAdminUserNewPassword("");
                              }
                            }} className="px-3 py-1.5 text-xs font-medium text-theme-400 bg-theme-500/10 hover:bg-theme-500/20 rounded-lg transition-colors">
                              {editingUserId === u.id ? "Cancel" : "Change Password"}
                            </button>
                          )}
                          {u.id !== user.id && u.isGoogleUser && (
                            <span className="px-2.5 py-1 text-[11px] font-medium text-amber-400/80 bg-amber-500/10 rounded-lg border border-amber-500/20">
                              Google Account
                            </span>
                          )}
                          {u.id !== user.id && (
                            <button onClick={() => terminateUserSession(u.id, u.username)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all" title="Terminate active sessions (force logout)">
                              <Power size={16} />
                            </button>
                          )}
                          {u.id !== user.id && (
                            <button onClick={() => banUserIp(u.id, u.username)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title={u.lastIp ? `Ban IP ${u.lastIp}` : "No known IP on record yet"}>
                              <Ban size={16} />
                            </button>
                          )}
                          {u.id !== user.id && (
                            <button onClick={() => deleteUser(u.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete user account">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      {editingUserId === u.id && (
                        <div className="mt-4 pt-4 border-t border-border-subtle flex gap-3">
                          <input 
                            type="password" 
                            placeholder="New Password (min 8 chars)" 
                            value={adminUserNewPassword}
                            onChange={(e) => setAdminUserNewPassword(e.target.value)}
                            className="flex-1 bg-muted border border-border focus:border-theme-500 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
                          />
                          <button 
                            onClick={() => changeUserPassword(u.id)}
                            className="px-4 py-2 bg-theme-500 hover:bg-theme-600 text-foreground text-sm font-medium rounded-lg transition-colors shadow-sm"
                          >
                            Save
                          </button>
                        </div>
                      )}
                   </div>

                 ))}
               </div>

              {bannedIps.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border-subtle">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                    <Ban size={15} className="text-red-400" /> Banned IP Addresses ({bannedIps.length})
                  </h3>
                  <div className="space-y-2">
                    {bannedIps.map((b: any) => (
                      <div key={b.ip} className="flex items-center justify-between p-3 bg-muted-subtle border border-border-subtle rounded-xl">
                        <div>
                          <p className="font-mono text-sm text-foreground">{b.ip}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{b.reason || "No reason given"}</p>
                        </div>
                        <button
                          onClick={() => unbanIpAddress(b.ip)}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
                        >
                          Unban
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {false && activeTab === "eggs" && (
        <div className="bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border-subtle pb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center text-foreground">
                <Package className="mr-3 text-theme-400 w-6 h-6" /> Server Eggs
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Eggs define what shows up on the Create Server page. Upload an egg JSON file to add a new
                category / software option (e.g. Minecraft, Python) — if it has versions, a version dropdown
                will appear automatically once it's selected.
              </p>
            </div>
            <div>
              <input
                type="file"
                accept="application/json,.json"
                ref={eggFileInputRef}
                onChange={handleEggFileUpload}
                className="hidden"
                id="egg-upload-input"
              />
              <label
                htmlFor="egg-upload-input"
                className={`cursor-pointer inline-flex items-center px-4 py-2.5 bg-white text-zinc-900 hover:bg-zinc-200 font-semibold rounded-xl transition-all shadow-sm active:scale-[0.98] ${isUploadingEgg ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Upload className="w-4 h-4 mr-2" /> {isUploadingEgg ? "Uploading..." : "Upload Egg"}
              </label>
            </div>
          </div>

          {eggUploadMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${eggUploadMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {eggUploadMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{eggUploadMsg.text}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-theme-500/10 border border-theme-500/20 mb-6 text-xs text-theme-200/90 leading-relaxed">
            <div className="font-bold text-theme-300 text-sm mb-1 flex items-center gap-2">
              <Sparkles size={16} /> Egg JSON format:
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{`{
  "name": "Paper",
  "category": "Minecraft",
  "dockerImage": "itzg/minecraft-server:latest",
  "portEnvVar": "SERVER_PORT",
  "volumePath": "/data",
  "envVars": { "TYPE": "PAPER", "EULA": "TRUE" },
  "versionEnvVar": "VERSION",
  "versions": ["latest", "1.21.1"]
}`}</pre>
          </div>

          <div className="space-y-3">
            {eggs.length === 0 && (
              <p className="text-sm text-muted-foreground">No eggs uploaded yet.</p>
            )}
            {Object.entries(
              eggs.reduce((acc: Record<string, any[]>, egg: any) => {
                (acc[egg.category] = acc[egg.category] || []).push(egg);
                return acc;
              }, {})
            ).map(([cat, catEggs]: [string, any[]]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4">{cat}</h3>
                {catEggs.map((egg) => (
                  <div key={egg.id} className="flex justify-between items-center p-3 bg-muted-subtle border border-border-subtle rounded-xl hover:bg-muted transition-colors mb-2">
                    <div>
                      <p className="font-medium text-foreground text-sm">{egg.name}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{egg.dockerImage}</p>
                    </div>
                    <button onClick={() => deleteEgg(egg.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete egg">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {false && activeTab === "extensions" && (
        <div className="bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border-subtle pb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center text-foreground">
                <Puzzle className="mr-3 text-theme-400 w-6 h-6" /> Extensions
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Extensions add new tabs to Minecraft servers only (Player actions, RCON tools, quick
                plugin installers...) without writing any code. Upload an extension JSON to add one.
              </p>
            </div>
            <div>
              <input
                type="file"
                accept="application/json,.json"
                ref={extFileInputRef}
                onChange={handleExtFileUpload}
                className="hidden"
                id="ext-upload-input"
              />
              <label
                htmlFor="ext-upload-input"
                className={`cursor-pointer inline-flex items-center px-4 py-2.5 bg-white text-zinc-900 hover:bg-zinc-200 font-semibold rounded-xl transition-all shadow-sm active:scale-[0.98] ${isUploadingExt ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Upload className="w-4 h-4 mr-2" /> {isUploadingExt ? "Uploading..." : "Upload Extension"}
              </label>
            </div>
          </div>

          {extUploadMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${extUploadMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {extUploadMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{extUploadMsg.text}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-theme-500/10 border border-theme-500/20 mb-6 text-xs text-theme-200/90 leading-relaxed">
            <div className="font-bold text-theme-300 text-sm mb-1 flex items-center gap-2">
              <Sparkles size={16} /> Extension JSON format:
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{`{
  "name": "Quick Moderation",
  "description": "Common admin actions",
  "appliesTo": "minecraft",
  "sections": [
    { "title": "Online Players", "type": "rcon_output", "command": "list", "refreshSeconds": 10 },
    { "title": "Actions", "type": "rcon_buttons", "buttons": [
        { "label": "Op Player", "commandTemplate": "op {input}", "inputPlaceholder": "username" },
        { "label": "Save World", "commandTemplate": "save-all" }
    ]},
    { "title": "Quick Plugins", "type": "download_install", "targetDir": "plugins", "items": [
        { "name": "EssentialsX", "modrinthProject": "essentialsx" },
        { "name": "Custom jar", "url": "https://.../MyPlugin.jar" }
    ]},
    { "title": "Votifier Tester", "type": "votifier_test" },
    { "title": "Plugin Manager", "type": "plugin_search" }
  ]
}`}</pre>
            <p className="mt-2 text-[11px] text-theme-200/70">plugin_search embeds the full Plugin Manager (search + install across Modrinth/SpigotMC/Paper Hangar) — no config needed. download_install items can use either a direct "url" or a "modrinthProject" slug for a simpler fixed list instead.</p>
          </div>

          <div className="space-y-2">
            {extensions.length === 0 && (
              <p className="text-sm text-muted-foreground">No extensions uploaded yet.</p>
            )}
            {extensions.map((ext) => (
              <div key={ext.id} className="flex justify-between items-center p-3 bg-muted-subtle border border-border-subtle rounded-xl hover:bg-muted transition-colors">
                <div>
                  <p className="font-medium text-foreground text-sm">{ext.name}{ext.builtin && <span className="text-xs text-muted-foreground ml-2">(built-in)</span>}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ext.description || `${ext.sections.length} section(s)`} • {ext.enabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleExtension(ext.id)} className={`p-1.5 rounded-lg transition-all border ${ext.enabled ? "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10" : "text-muted-foreground border-transparent hover:border-border-strong hover:bg-muted"}`} title={ext.enabled ? "Disable" : "Enable"}>
                    <Power size={16} />
                  </button>
                  {!ext.builtin && (
                    <button onClick={() => deleteExtension(ext.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete extension">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {false && activeTab === "users" && (
        <div className="bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl mt-8">
          <h2 className="text-xl font-bold mb-4 flex items-center text-foreground">
            <RefreshCw className="mr-3 text-emerald-400 w-5 h-5" /> System Update
          </h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-2xl">
            Trigger an automatic update of the XyneX Panel. This will run git pull and rebuild the system. The panel will be unavailable for a few seconds during this process.
          </p>
          <button 
            onClick={handleSystemUpdate}
            disabled={isUpdatingSystem}
            className="px-6 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-medium rounded-xl border border-emerald-500/20 transition-all shadow-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isUpdatingSystem ? "animate-spin" : ""}`} />
            {isUpdatingSystem ? "Updating System..." : "Update Panel"}
          </button>
        </div>
      )}

        </div>
      </div>

      {(isProcessing || isUpdatingLogo || isSavingSettings || isChangingPassword || isCreatingUser || isUpdatingSystem) && <LoadingOverlay />}
    </motion.div>
  );
}
