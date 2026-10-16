import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { motion } from "framer-motion";
import { Shield, User, Trash2, Layout, Upload, RefreshCw, Key, CheckCircle2, AlertCircle, Globe, Sparkles, ExternalLink, Package, Puzzle, Power, Database, Users, Palette, Rocket, ArrowLeft, FolderTree, Server, Plus, Copy, X, Wifi, WifiOff, Ban, Settings as SettingsIcon, LayoutDashboard, Cpu, MemoryStick, HardDrive, Activity, Crown, LifeBuoy } from "lucide-react";
import { ImageCropper } from "../components/ImageCropper";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { initializeApp, deleteApp, getApps } from "firebase/app";
import CreateServer from "./CreateServer";
import AdminServers from "./AdminServers";
import ApiKeysManager from "../components/ApiKeysManager";
import IntegrationsManager from "../components/IntegrationsManager";
import SupportTicketsAdmin from "../components/SupportTicketsAdmin";
import { useNotification } from "../context/NotificationContext";
import { resolveFullTheme } from "../utils/themeColor";

export default function AdminPanel() {
  const { notify } = useNotification();
  const { user, logout, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  type AdminTab = "dashboard" | "database" | "personalization" | "extensions" | "eggs" | "playit" | "users" | "mounts" | "nodes" | "traffic" | "createserver" | "manageserver" | "apikeys" | "activity" | "support";
  const validTabs: AdminTab[] = ["dashboard", "createserver", "manageserver", "apikeys", "database", "personalization", "extensions", "eggs", "mounts", "nodes", "traffic", "playit", "users", "activity", "support"];
  const tabFromUrl = searchParams.get("tab") as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "dashboard");
  const [showCreateServerForm, setShowCreateServerForm] = useState(false);
  useEffect(() => {
    if (activeTab !== "createserver") setShowCreateServerForm(false);
  }, [activeTab]);
  const { 
    panelName, panelLogo, panelBackgroundImage, panelBackgroundBlur, 
    enablePlayit, enableTutorial, enableLoginAnimation, enableRegistration, theme, 
    maintenanceMode, maintenanceMessage,
    customTheme, setCustomTheme,
    navLayout, setNavLayout,
    announcementEnabled, setAnnouncementEnabled,
    announcementText, setAnnouncementText,
    announcementColor, setAnnouncementColor,
    enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId, 
    firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId, 
    fetchSettings 
  } = useSettings();

  // ---- Custom accent theme upload (Personalization tab) ----
  const customThemeInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCustomTheme, setIsUploadingCustomTheme] = useState(false);
  const [customThemeMsg, setCustomThemeMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleCustomThemeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCustomTheme(true);
    setCustomThemeMsg(null);
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const resolved = resolveFullTheme(parsed);
        await axios.put("/api/system/settings", {
          customTheme: JSON.stringify(resolved),
          theme: "custom",
        });
        setCustomTheme(resolved);
        document.documentElement.setAttribute("data-theme", "custom");
        setCustomThemeMsg({ text: `Theme "${resolved.name}" uploaded and applied!`, type: "success" });
        fetchSettings();
      } catch (err: any) {
        setCustomThemeMsg({ text: err.message || "Invalid theme file.", type: "error" });
      } finally {
        setIsUploadingCustomTheme(false);
        if (customThemeInputRef.current) customThemeInputRef.current.value = "";
      }
    });
    reader.readAsText(file);
  };
  
  const [users, setUsers] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");

  // ---- Admin Dashboard overview stats ----
  const [dashServers, setDashServers] = useState<any[]>([]);
  const [dashHostStats, setDashHostStats] = useState<{ cpuUsage: number; ramUsage: number; totalMemory: number; freeMemory: number; diskUsage: number } | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  const fetchDashboardOverview = async () => {
    try {
      const [serversRes, statsRes] = await Promise.allSettled([
        axios.get("/api/servers"),
        axios.get("/api/system/stats"),
      ]);
      if (serversRes.status === "fulfilled") setDashServers(serversRes.value.data || []);
      if (statsRes.status === "fulfilled") setDashHostStats(statsRes.value.data);
    } catch (e) {
      // ignore
    } finally {
      setDashLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchDashboardOverview();
      const interval = setInterval(fetchDashboardOverview, 8000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const dashOnlineCount = dashServers.filter((s: any) => s.status === "online").length;
  const dashOfflineCount = dashServers.filter((s: any) => s.status !== "online").length;

  // Username Change State
  const [newCustomUsername, setNewCustomUsername] = useState(user?.username || "");
  const [isChangingUsername, setIsChangingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
  const [newPanelName, setNewPanelName] = useState(panelName);

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

  // ---- Nests (category rename for grouped eggs) ----
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryRenameValue, setCategoryRenameValue] = useState("");

  const handleRenameCategory = async (oldName: string) => {
    const newName = categoryRenameValue.trim();
    if (!newName || newName === oldName) {
      setEditingCategory(null);
      return;
    }
    try {
      await axios.put("/api/eggs/category", { oldName, newName });
      fetchEggs();
    } catch (err) {
      console.error(err);
      notify("Failed to rename category.");
    } finally {
      setEditingCategory(null);
    }
  };

  // ---- Mounts (shared host folders attachable to eggs/servers) ----
  const [mounts, setMounts] = useState<any[]>([]);
  const [eggsForMounts, setEggsForMounts] = useState<any[]>([]);
  const [newMountName, setNewMountName] = useState("");
  const [newMountSource, setNewMountSource] = useState("");
  const [newMountTarget, setNewMountTarget] = useState("");
  const [newMountReadOnly, setNewMountReadOnly] = useState(false);
  const [newMountEggIds, setNewMountEggIds] = useState<string[]>([]);
  const [isCreatingMount, setIsCreatingMount] = useState(false);
  const [mountMsg, setMountMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchMounts = async () => {
    try {
      const res = await axios.get("/api/mounts");
      setMounts(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchEggsForMounts = async () => {
    try {
      const res = await axios.get("/api/eggs");
      setEggsForMounts(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchMounts();
      fetchEggsForMounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- Nodes (Pterodactyl-style remote node management) ----
  const [nodes, setNodes] = useState<any[]>([]);
  const [nodesMsg, setNodesMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showCreateNode, setShowCreateNode] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeFqdn, setNewNodeFqdn] = useState("");
  const [newNodeLocation, setNewNodeLocation] = useState("");
  const [newNodeMemory, setNewNodeMemory] = useState("");
  const [newNodeDisk, setNewNodeDisk] = useState("");
  const [isCreatingNode, setIsCreatingNode] = useState(false);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [nodeDetailTab, setNodeDetailTab] = useState<"config" | "allocations">("config");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [nodeAllocations, setNodeAllocations] = useState<any[]>([]);
  const [allocIp, setAllocIp] = useState("");
  const [allocFrom, setAllocFrom] = useState("");
  const [allocTo, setAllocTo] = useState("");
  const [isCreatingAlloc, setIsCreatingAlloc] = useState(false);
  const [allocMsg, setAllocMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchNodes = async () => {
    try {
      const res = await axios.get("/api/nodes");
      setNodes(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user?.role === "admin") fetchNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- Activity Log (Pterodactyl-style admin-wide audit trail) ----
  const [activityEntries, setActivityEntries] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchActivity = async () => {
    try {
      setActivityLoading(true);
      const res = await axios.get("/api/admin/activity", { params: { limit: 150 } });
      setActivityEntries(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin" && activeTab === "activity") fetchActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab]);

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingNode(true);
    setNodesMsg(null);
    try {
      const res = await axios.post("/api/nodes", {
        name: newNodeName,
        fqdn: newNodeFqdn,
        location: newNodeLocation,
        memory: newNodeMemory ? Number(newNodeMemory) : 0,
        disk: newNodeDisk ? Number(newNodeDisk) : 0,
      });
      setNewNodeName(""); setNewNodeFqdn(""); setNewNodeLocation(""); setNewNodeMemory(""); setNewNodeDisk("");
      setShowCreateNode(false);
      await fetchNodes();
      setNodesMsg({ text: res.data.tunnelMessage || "Node created.", type: res.data.tunnelConfigured ? "success" : "error" });
      openNodeDetail(res.data.id);
    } catch (err: any) {
      setNodesMsg({ text: err.response?.data?.error || "Failed to create node", type: "error" });
    } finally {
      setIsCreatingNode(false);
    }
  };

  const handleDeleteNode = async (id: string) => {
    if (!confirm("Delete this node? Servers already assigned to it will keep running but the node will no longer be selectable.")) return;
    try {
      await axios.delete(`/api/nodes/${id}`);
      if (selectedNodeId === id) { setSelectedNodeId(null); setSelectedNode(null); }
      await fetchNodes();
    } catch (err: any) {
      setNodesMsg({ text: err.response?.data?.error || "Failed to delete node", type: "error" });
    }
  };

  const openNodeDetail = async (id: string) => {
    setSelectedNodeId(id);
    setNodeDetailTab("config");
    try {
      const res = await axios.get(`/api/nodes/${id}`);
      setSelectedNode(res.data);
      fetchNodeAllocations(id);
    } catch (err) { console.error(err); }
  };

  const fetchNodeAllocations = async (nodeId: string) => {
    try {
      const res = await axios.get(`/api/nodes/${nodeId}/allocations`);
      setNodeAllocations(res.data);
    } catch (err) { console.error(err); }
  };

  const handleCreateAllocations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNodeId) return;
    setIsCreatingAlloc(true);
    setAllocMsg(null);
    try {
      const res = await axios.post(`/api/nodes/${selectedNodeId}/allocations`, {
        ip: allocIp, portFrom: allocFrom, portTo: allocTo,
      });
      setAllocMsg({ text: `Created ${res.data.created} allocation(s).`, type: "success" });
      setAllocFrom(""); setAllocTo("");
      fetchNodeAllocations(selectedNodeId);
    } catch (err: any) {
      setAllocMsg({ text: err.response?.data?.error || "Failed to create allocations", type: "error" });
    } finally {
      setIsCreatingAlloc(false);
    }
  };

  const handleDeleteAllocation = async (allocId: string) => {
    if (!selectedNodeId) return;
    try {
      await axios.delete(`/api/nodes/${selectedNodeId}/allocations/${allocId}`);
      fetchNodeAllocations(selectedNodeId);
    } catch (err) { console.error(err); }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    }).catch(() => {});
  };

  const handleCreateMount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingMount(true);
    setMountMsg(null);
    try {
      await axios.post("/api/mounts", {
        name: newMountName.trim(),
        sourcePath: newMountSource.trim(),
        targetPath: newMountTarget.trim(),
        readOnly: newMountReadOnly,
        eggIds: newMountEggIds,
      });
      setNewMountName(""); setNewMountSource(""); setNewMountTarget(""); setNewMountReadOnly(false); setNewMountEggIds([]);
      fetchMounts();
      setMountMsg({ text: "Mount created.", type: "success" });
    } catch (err: any) {
      setMountMsg({ text: err.response?.data?.error || "Failed to create mount.", type: "error" });
    } finally {
      setIsCreatingMount(false);
    }
  };

  const handleDeleteMount = async (id: string) => {
    if (!confirm("Delete this mount? Servers using it will lose access to this folder the next time they're recreated.")) return;
    try {
      await axios.delete(`/api/mounts/${id}`);
      fetchMounts();
    } catch (err) { console.error(err); }
  };

  const [newEnablePlayit, setNewEnablePlayit] = useState(enablePlayit);

  // ---- Node (VPS public IP + port range for direct-connect servers) ----
  const [nodeIp, setNodeIp] = useState("");
  const [nodePortRangeStart, setNodePortRangeStart] = useState("");
  const [nodePortRangeEnd, setNodePortRangeEnd] = useState("");
  const [isSavingNode, setIsSavingNode] = useState(false);
  const [nodeMsg, setNodeMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    axios.get("/api/settings").then((res) => {
      setNodeIp(res.data.nodeIp || "");
      setNodePortRangeStart(res.data.nodePortRangeStart ? String(res.data.nodePortRangeStart) : "");
      setNodePortRangeEnd(res.data.nodePortRangeEnd ? String(res.data.nodePortRangeEnd) : "");
    }).catch(() => {});
  }, []);

  const handleSaveNode = async () => {
    setIsSavingNode(true);
    setNodeMsg(null);
    try {
      await axios.put("/api/system/settings", {
        nodeIp: nodeIp.trim(),
        nodePortRangeStart: nodePortRangeStart ? Number(nodePortRangeStart) : null,
        nodePortRangeEnd: nodePortRangeEnd ? Number(nodePortRangeEnd) : null,
      });
      setNodeMsg({ text: "Node settings saved.", type: "success" });
    } catch (e: any) {
      setNodeMsg({ text: e.response?.data?.error || "Failed to save node settings.", type: "error" });
    } finally {
      setIsSavingNode(false);
    }
  };
  const [newEnableTutorial, setNewEnableTutorial] = useState(enableTutorial);
  const [newEnableLoginAnimation, setNewEnableLoginAnimation] = useState(enableLoginAnimation);
  const [newEnableRegistration, setNewEnableRegistration] = useState(enableRegistration);
  const [newMaintenanceMode, setNewMaintenanceMode] = useState(false);
  const [newMaintenanceMessage, setNewMaintenanceMessage] = useState("");
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
    setNewMaintenanceMode(maintenanceMode);
    setNewMaintenanceMessage(maintenanceMessage);
    setNewTheme(theme);
    setFbEnableGoogleLogin(enableGoogleLogin || false);
    setFbApiKey(firebaseApiKey || "");
    setFbAuthDomain(firebaseAuthDomain || "");
    setFbProjectId(firebaseProjectId || "");
    setFbStorageBucket(firebaseStorageBucket || "");
    setFbMessagingSenderId(firebaseMessagingSenderId || "");
    setFbAppId(firebaseAppId || "");
  }, [panelName, enablePlayit, enableTutorial, enableLoginAnimation, enableRegistration, maintenanceMode, maintenanceMessage, theme, enableGoogleLogin, firebaseApiKey, firebaseAuthDomain, firebaseProjectId, firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId]);

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

  // ---- Traffic (live per-IP request rate + manual/one-click IP blocking) ----
  const [trafficRows, setTrafficRows] = useState<any[]>([]);
  const [trafficTrackedIps, setTrafficTrackedIps] = useState(0);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [manualBanIp, setManualBanIp] = useState("");
  const [manualBanReason, setManualBanReason] = useState("");
  const [isManualBanning, setIsManualBanning] = useState(false);

  const fetchTraffic = async () => {
    try {
      setTrafficLoading(true);
      const res = await axios.get("/api/system/traffic");
      setTrafficRows(res.data.rows || []);
      setTrafficTrackedIps(res.data.trackedIps || 0);
    } catch (e) {
      // ignore
    } finally {
      setTrafficLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin" && activeTab === "traffic") {
      fetchTraffic();
      fetchBannedIps();
      const interval = setInterval(fetchTraffic, 5000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab]);

  const blockIpFromTraffic = async (ip: string) => {
    if (!confirm(`Block ${ip}? It won't be able to reach the panel until unbanned.`)) return;
    try {
      await axios.post("/api/system/banned-ips", { ip, reason: "Blocked from Traffic tab" });
      notify(`Blocked ${ip}.`);
      fetchBannedIps();
      fetchTraffic();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to block IP");
    }
  };

  const submitManualBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBanIp.trim()) return;
    setIsManualBanning(true);
    try {
      await axios.post("/api/system/banned-ips", { ip: manualBanIp.trim(), reason: manualBanReason.trim() });
      notify(`Blocked ${manualBanIp.trim()}.`);
      setManualBanIp(""); setManualBanReason("");
      fetchBannedIps();
      fetchTraffic();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to block IP");
    } finally {
      setIsManualBanning(false);
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
    <div className="h-[100dvh] w-full flex flex-col bg-transparent text-foreground overflow-hidden">
      <header className="h-16 flex items-center gap-3 px-4 sm:px-6 bg-card/80 backdrop-blur-xl border-b border-border-subtle relative z-10 shrink-0">
        <Link to="/" className="p-1.5 bg-muted hover:bg-white/[0.08] border border-border-subtle shadow-sm rounded-lg text-muted-foreground hover:text-foreground transition-all shrink-0">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-foreground">Admin Panel</h1>
        <Link
          to="/settings"
          className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-muted hover:bg-white/[0.08] border border-border-subtle text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
        >
          <SettingsIcon size={15} /> Account Settings
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full relative z-10"
    >
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {user.role === "admin" && (
          <nav className="w-full lg:w-60 flex-shrink-0 bg-black/40 dark:bg-black/40 backdrop-blur-2xl border border-border rounded-3xl p-3 shadow-[0_0_50px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle lg:sticky lg:top-6">
            <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible">
              {[
                { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
                { key: "createserver", label: "Servers", icon: <Server size={17} /> },
                { key: "apikeys", label: "API Keys", icon: <Key size={17} /> },
                { key: "database", label: "Database", icon: <Database size={17} /> },
                { key: "personalization", label: "Personalization", icon: <Palette size={17} /> },
                { key: "extensions", label: "Extensions", icon: <Puzzle size={17} /> },
                { key: "eggs", label: "Egg Upload", icon: <Package size={17} /> },
                { key: "mounts", label: "Mounts", icon: <FolderTree size={17} /> },
                { key: "nodes", label: "Nodes", icon: <Server size={17} /> },
                { key: "traffic", label: "Traffic", icon: <Ban size={17} /> },
                { key: "activity", label: "Activity Log", icon: <Activity size={17} /> },
                { key: "support", label: "Support Tickets", icon: <LifeBuoy size={17} /> },
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

      {user.role === "admin" && activeTab === "dashboard" && (
        <div className="space-y-6 mb-8">
          {/* Admin identity header */}
          <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-card/80 backdrop-blur-2xl p-6 md:p-8 shadow-xl">
            <div className="absolute -top-16 -right-16 h-52 w-52 rounded-full bg-theme-500/20 blur-[70px]" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-theme-500 to-violet-600 flex items-center justify-center text-2xl font-bold text-white shadow-[0_0_25px_rgba(99,102,241,0.4)] shrink-0">
                {(user?.username || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl md:text-2xl font-bold text-foreground truncate">{user?.username}</h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-theme-500/10 text-theme-400 border border-theme-500/20">
                    <Crown size={11} /> {user?.role}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Welcome back to the admin control center.</p>
              </div>
              <button
                onClick={fetchDashboardOverview}
                className="sm:ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-muted hover:bg-white/[0.08] border border-border-subtle text-sm font-medium text-muted-foreground hover:text-foreground transition-all self-start"
              >
                <RefreshCw size={14} className={dashLoading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Users</span>
                <Users size={16} className="text-theme-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{users.length}</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Servers</span>
                <Server size={16} className="text-sky-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{dashServers.length}</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Online</span>
                <Wifi size={16} className="text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{dashOnlineCount}</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offline</span>
                <WifiOff size={16} className="text-rose-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{dashOfflineCount}</p>
            </div>
          </div>

          {/* Host resource usage */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPU Load</span>
                <Cpu size={16} className="text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{dashHostStats?.cpuUsage ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">RAM Usage</span>
                <MemoryStick size={16} className="text-fuchsia-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{dashHostStats?.ramUsage ?? 0}%</p>
              <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    (dashHostStats?.ramUsage ?? 0) > 85 ? "bg-rose-500" : (dashHostStats?.ramUsage ?? 0) > 60 ? "bg-amber-500" : "bg-theme-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, dashHostStats?.ramUsage ?? 0))}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disk Usage</span>
                <HardDrive size={16} className="text-teal-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{dashHostStats?.diskUsage ?? 0}%</p>
            </div>
          </div>

          {/* Recent servers */}
          <div className="rounded-2xl border border-border-subtle bg-card/70 backdrop-blur-xl p-5 md:p-6">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Activity size={16} className="text-theme-400" /> Recent Servers
            </h3>
            {dashServers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No servers deployed yet.</p>
            ) : (
              <div className="divide-y divide-border-subtle">
                {dashServers.slice(0, 6).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${s.status === "online" ? "bg-emerald-400" : "bg-rose-400"}`} />
                      <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize shrink-0">{s.status || "offline"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {user.role === "admin" && activeTab === "createserver" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative mb-8">
          {showCreateServerForm ? (
            <CreateServer onBack={() => setShowCreateServerForm(false)} onCreated={() => setShowCreateServerForm(false)} />
          ) : (
            <AdminServers onCreateServer={() => setShowCreateServerForm(true)} />
          )}
        </div>
      )}

      {user.role === "admin" && activeTab === "manageserver" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative mb-8">
          <AdminServers />
        </div>
      )}

      {user.role === "admin" && activeTab === "apikeys" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <h2 className="text-xl font-bold mb-6 flex items-center text-foreground relative z-10">
            <Key className="mr-3 text-theme-400 w-5 h-5" /> API Keys
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl mb-6">
            Manage API keys for accessing the panel via the dashboard.
          </p>
          <ApiKeysManager />
          <IntegrationsManager />
        </div>
      )}

      {user.role === "admin" && activeTab === "database" && (
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

      {user.role === "admin" && activeTab === "personalization" && (
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

          {/* Accent Theme */}
          <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 flex items-center text-foreground">
              <Palette className="mr-3 text-theme-400 w-5 h-5" /> Accent Theme
            </h2>
            <p className="text-xs text-muted-foreground mb-5">Pick the accent color used across the panel — sidebar, buttons, badges, and highlights update instantly for every user.</p>
            <div className="grid grid-cols-5 gap-3">
              {[
                { key: "indigo", label: "Indigo", hex: "#6366f1" },
                { key: "red", label: "Red", hex: "#ef4444" },
                { key: "orange", label: "Orange", hex: "#f97316" },
                { key: "amber", label: "Amber", hex: "#f59e0b" },
                { key: "green", label: "Green", hex: "#10b981" },
                { key: "cyan", label: "Cyan", hex: "#06b6d4" },
                { key: "blue", label: "Blue", hex: "#3b82f6" },
                { key: "purple", label: "Purple", hex: "#a855f7" },
                { key: "rose", label: "Rose", hex: "#f43f5e" },
                { key: "white", label: "Mono", hex: "#a1a1aa" },
                { key: "midnight", label: "Midnight", hex: "#0ea5e9" },
                { key: "emerald", label: "Emerald", hex: "#059669" },
                { key: "sunset", label: "Sunset", hex: "#f4511e" },
                { key: "violet", label: "Violet", hex: "#7c3aed" },
                { key: "gold", label: "Gold", hex: "#ca8a04" },
                { key: "crimson", label: "Crimson", hex: "#b91c1c" },
                { key: "slate", label: "Slate", hex: "#475569" },
                { key: "mint", label: "Mint", hex: "#14b8a6" },
              ].map((t) => (
                <button
                  key={t.key}
                  title={t.label}
                  onClick={async () => {
                    try {
                      document.documentElement.setAttribute("data-theme", t.key);
                      await axios.put("/api/system/settings", { theme: t.key });
                      fetchSettings();
                    } catch (err: any) {
                      notify(err.response?.data?.error || "Error updating theme");
                    }
                  }}
                  className={`group flex flex-col items-center gap-2 p-2 rounded-2xl border transition-all active:scale-[0.95] ${theme === t.key ? "border-foreground/40 bg-muted" : "border-transparent hover:bg-muted/50"}`}
                >
                  <span
                    className="w-9 h-9 rounded-full shadow-inner flex items-center justify-center"
                    style={{ backgroundColor: t.hex }}
                  >
                    {theme === t.key && <CheckCircle2 size={16} className="text-white drop-shadow" />}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">{t.label}</span>
                </button>
              ))}

              {customTheme && (
                <button
                  title={customTheme.name}
                  onClick={async () => {
                    try {
                      document.documentElement.setAttribute("data-theme", "custom");
                      await axios.put("/api/system/settings", { theme: "custom" });
                      fetchSettings();
                    } catch (err: any) {
                      notify(err.response?.data?.error || "Error updating theme");
                    }
                  }}
                  className={`group flex flex-col items-center gap-2 p-2 rounded-2xl border transition-all active:scale-[0.95] ${theme === "custom" ? "border-foreground/40 bg-muted" : "border-transparent hover:bg-muted/50"}`}
                >
                  <span
                    className="w-9 h-9 rounded-full shadow-inner flex items-center justify-center"
                    style={{ backgroundColor: customTheme.shades["500"] }}
                  >
                    {theme === "custom" && <CheckCircle2 size={16} className="text-white drop-shadow" />}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground truncate max-w-[56px]">{customTheme.name}</span>
                </button>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-border-subtle">
              <h3 className="text-sm font-bold text-foreground mb-1">Upload Full Theme</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Upload a single JSON file to reskin the entire panel. Minimal example: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{`{"name": "My Theme", "primary": "#ff5733"}`}</code>. Optional fields for a total makeover: <code className="text-[11px] bg-muted px-1 py-0.5 rounded">background</code> (page/card/text/border colors), <code className="text-[11px] bg-muted px-1 py-0.5 rounded">font</code> (custom typeface + Google Font URL), <code className="text-[11px] bg-muted px-1 py-0.5 rounded">buttonPrimary</code>, <code className="text-[11px] bg-muted px-1 py-0.5 rounded">radius</code> (corner roundness, e.g. "0px" for sharp or "9999px" for pill), <code className="text-[11px] bg-muted px-1 py-0.5 rounded">glow</code> (accent hover glow), <code className="text-[11px] bg-muted px-1 py-0.5 rounded">backgroundPattern</code> (overlay image/texture), and raw <code className="text-[11px] bg-muted px-1 py-0.5 rounded">customCss</code> for anything else.
              </p>
              {customThemeMsg && (
                <div className={`p-3 rounded-xl mb-3 flex items-center gap-2 text-xs font-medium ${customThemeMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                  {customThemeMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>{customThemeMsg.text}</span>
                </div>
              )}
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                ref={customThemeInputRef}
                onChange={handleCustomThemeUpload}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={isUploadingCustomTheme}
                  onClick={() => customThemeInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 bg-muted hover:bg-muted-hover text-foreground border border-border font-medium px-5 py-2.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isUploadingCustomTheme ? <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-foreground animate-spin"></div> : <Upload size={16} />}
                  {isUploadingCustomTheme ? "Uploading..." : "Upload Theme JSON"}
                </button>
                {customTheme && (
                  <button
                    onClick={async () => {
                      try {
                        await axios.put("/api/system/settings", { customTheme: "", theme: "indigo" });
                        setCustomTheme(null);
                        document.documentElement.setAttribute("data-theme", "indigo");
                        fetchSettings();
                      } catch (err: any) {
                        notify(err.response?.data?.error || "Error removing theme");
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 bg-muted hover:bg-red-500/10 text-muted-foreground hover:text-red-400 border border-transparent hover:border-red-500/30 font-medium px-5 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                  >
                    <Trash2 size={16} /> Remove Custom Theme
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Layout */}
          <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 flex items-center text-foreground">
              <LayoutDashboard className="mr-3 text-theme-400 w-5 h-5" /> Navigation Layout
            </h2>
            <p className="text-xs text-muted-foreground mb-5">Change where navigation appears across the whole panel — instantly, for every user.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: "sidebar", label: "Sidebar", desc: "Classic left-side menu (default)" },
                { key: "top", label: "Top Navbar", desc: "Links in a bar across the top" },
                { key: "bottom", label: "Bottom Navbar", desc: "Mobile app style, tabs at the bottom" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={async () => {
                    try {
                      setNavLayout(opt.key);
                      await axios.put("/api/system/settings", { navLayout: opt.key });
                      fetchSettings();
                    } catch (err: any) {
                      notify(err.response?.data?.error || "Error updating layout");
                    }
                  }}
                  className={`flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${navLayout === opt.key ? "border-theme-500/50 bg-theme-500/10" : "border-border-subtle bg-muted/40 hover:bg-muted/70"}`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                    {navLayout === opt.key && <CheckCircle2 size={14} className="text-theme-400 ml-auto" />}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Announcement Banner */}
          <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 flex items-center text-foreground">
              <Sparkles className="mr-3 text-amber-400 w-5 h-5" /> Announcement Banner
            </h2>
            <p className="text-xs text-muted-foreground mb-5">Show a message across the top of the panel for every user — maintenance notices, updates, whatever you like.</p>

            <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/50 border border-border-subtle mb-4">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Enable Banner</h3>
                <p className="text-xs text-muted-foreground mt-1">Turn the announcement banner on or off.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={announcementEnabled}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setAnnouncementEnabled(val);
                    try {
                      await axios.put("/api/system/settings", { announcementEnabled: val });
                      fetchSettings();
                    } catch (err) { console.error(err); }
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <label className="block text-sm font-medium text-muted-foreground mb-2">Message</label>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder="e.g. Scheduled maintenance tonight at 11 PM UTC — servers may briefly restart."
              rows={3}
              className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground text-sm transition-all shadow-inner outline-none resize-none mb-4"
            />

            <label className="block text-sm font-medium text-muted-foreground mb-2">Banner Color</label>
            <div className="flex gap-2 mb-5">
              {[
                { key: "theme", label: "Accent" },
                { key: "emerald", label: "Success" },
                { key: "amber", label: "Warning" },
                { key: "red", label: "Alert" },
              ].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setAnnouncementColor(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${announcementColor === c.key ? "border-foreground/40 bg-muted" : "border-transparent bg-muted/40 hover:bg-muted/70 text-muted-foreground"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              onClick={async () => {
                try {
                  await axios.put("/api/system/settings", { announcementText, announcementColor });
                  fetchSettings();
                  notify("Announcement saved!");
                } catch (err: any) {
                  notify(err.response?.data?.error || "Error saving announcement");
                }
              }}
              className="bg-theme-600 hover:bg-theme-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
            >
              Save Announcement
            </button>
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

              <div className="p-4 rounded-2xl bg-muted/50 border border-border-subtle">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Maintenance Mode</h3>
                    <p className="text-xs text-muted-foreground mt-1">Lock the panel for everyone except admins — regular users see a maintenance page instead.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={newMaintenanceMode}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setNewMaintenanceMode(val);
                        try {
                          await axios.put("/api/system/settings", { maintenanceMode: val });
                          fetchSettings();
                          notify(val ? "Maintenance mode enabled." : "Maintenance mode disabled.");
                        } catch (err) { console.error(err); }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
                {newMaintenanceMode && (
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Message shown to users</label>
                    <textarea
                      rows={2}
                      value={newMaintenanceMessage}
                      onChange={(e) => setNewMaintenanceMessage(e.target.value)}
                      onBlur={async () => {
                        try {
                          await axios.put("/api/system/settings", { maintenanceMessage: newMaintenanceMessage });
                          fetchSettings();
                        } catch (err) { console.error(err); }
                      }}
                      className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-3 py-2 text-sm text-foreground transition-all outline-none resize-none"
                      placeholder="We're performing scheduled maintenance. Please check back shortly."
                    />
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {user.role === "admin" && activeTab === "playit" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center text-foreground">
            <Server className="mr-3 text-theme-400 w-5 h-5" /> Node — Direct Connect (VPS/dedicated server)
          </h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            If this panel runs on a real VPS with a public IP, set it here along with a port range. New servers will automatically get a free port from this range, and players connect using <span className="font-mono text-foreground">your VPS IP : port</span> — just like Pterodactyl. If you're on a free/sandboxed host with no public IP, leave this empty and use Playit Tunnel below instead.
          </p>

          {nodeMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${nodeMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {nodeMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{nodeMsg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">VPS Public IP</label>
              <input value={nodeIp} onChange={(e) => setNodeIp(e.target.value)} type="text" placeholder="203.0.113.42" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Port Range Start</label>
              <input value={nodePortRangeStart} onChange={(e) => setNodePortRangeStart(e.target.value)} type="number" placeholder="19100 (default)" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Port Range End</label>
              <input value={nodePortRangeEnd} onChange={(e) => setNodePortRangeEnd(e.target.value)} type="number" placeholder="50000 (default)" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none" />
            </div>
          </div>

          <button
            onClick={handleSaveNode}
            disabled={isSavingNode}
            className="mt-6 bg-theme-500 hover:bg-theme-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {isSavingNode ? "Saving..." : "Save Node Settings"}
          </button>
        </div>
      )}

      {user.role === "admin" && activeTab === "playit" && (
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

      {user.role === "admin" && activeTab === "playit" && (
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

          <div className="flex items-center justify-between gap-4 p-4 mt-4 rounded-2xl bg-muted/50 border border-border-subtle">
            <div>
              <h3 className="font-semibold text-foreground text-sm">No TLS Verify</h3>
              <p className="text-xs text-muted-foreground mt-1">Skip TLS certificate verification between Cloudflare and this panel's local origin (safe here since traffic stays on localhost).</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input type="checkbox" checked={cfNoTlsVerify} onChange={(e) => setCfNoTlsVerify(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
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

      {user.role === "admin" && activeTab === "personalization" && (
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

      {user.role === "admin" && activeTab === "personalization" && (
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

      {user.role === "admin" && activeTab === "users" && (
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

      {user.role === "admin" && activeTab === "eggs" && (
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
                {editingCategory === cat ? (
                  <div className="flex items-center gap-2 mb-2 mt-4">
                    <input
                      autoFocus
                      value={categoryRenameValue}
                      onChange={(e) => setCategoryRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRenameCategory(cat)}
                      onBlur={() => handleRenameCategory(cat)}
                      className="text-xs font-semibold uppercase tracking-wider bg-muted border border-theme-500/50 rounded-lg px-2 py-1 text-foreground outline-none"
                    />
                  </div>
                ) : (
                  <h3
                    onClick={() => { setEditingCategory(cat); setCategoryRenameValue(cat); }}
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 cursor-pointer hover:text-theme-400 transition-colors inline-block"
                    title="Click to rename this category"
                  >
                    {cat}
                  </h3>
                )}
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

      {user.role === "admin" && activeTab === "mounts" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <h2 className="text-xl font-bold mb-2 flex items-center text-foreground">
            <FolderTree className="mr-3 text-theme-400 w-6 h-6" /> Mounts
          </h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            A mount attaches a folder from this host into servers' containers — useful for a shared mod/datapack cache or common assets. Leave "Applies to" empty to attach it to every server.
          </p>

          {mountMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${mountMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {mountMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{mountMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleCreateMount} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Name</label>
              <input required value={newMountName} onChange={(e) => setNewMountName(e.target.value)} type="text" placeholder="Shared Datapacks" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Host Folder (source path)</label>
              <input required value={newMountSource} onChange={(e) => setNewMountSource(e.target.value)} type="text" placeholder="/home/xynex/shared-cache" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Path Inside Server (target)</label>
              <input required value={newMountTarget} onChange={(e) => setNewMountTarget(e.target.value)} type="text" placeholder="/home/container/shared" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Applies To (eggs — leave empty for all)</label>
              <select
                multiple
                value={newMountEggIds}
                onChange={(e) => setNewMountEggIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground text-sm transition-all shadow-inner outline-none h-[42px]"
              >
                {eggsForMounts.map((egg: any) => (
                  <option key={egg.id} value={egg.id}>{egg.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center justify-between gap-4 p-4 rounded-2xl bg-muted/50 border border-border-subtle">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Read-only</h3>
                <p className="text-xs text-muted-foreground mt-1">Servers can read from this folder but not write to it.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input type="checkbox" checked={newMountReadOnly} onChange={(e) => setNewMountReadOnly(e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={isCreatingMount} className="bg-theme-500 hover:bg-theme-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50">
                {isCreatingMount ? "Creating..." : "Create Mount"}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {mounts.length === 0 && <p className="text-sm text-muted-foreground">No mounts created yet.</p>}
            {mounts.map((m: any) => (
              <div key={m.id} className="p-4 bg-muted-subtle border border-border-subtle rounded-xl flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">{m.name} {m.readOnly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 ml-1">Read-only</span>}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{m.sourcePath} → {m.targetPath}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(!m.eggIds || m.eggIds.length === 0) ? "Applies to all servers" : `Applies to: ${m.eggIds.map((id: string) => eggsForMounts.find((e: any) => e.id === id)?.name || id).join(", ")}`}
                  </p>
                </div>
                <button onClick={() => handleDeleteMount(m.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0" title="Delete mount">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {user.role === "admin" && activeTab === "nodes" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
            <h2 className="text-xl font-bold flex items-center text-foreground">
              <Server className="mr-3 text-theme-400 w-6 h-6" /> Nodes
            </h2>
            <button
              onClick={() => { setShowCreateNode(true); setNodesMsg(null); }}
              className="flex items-center gap-2 bg-theme-500 hover:bg-theme-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] text-sm"
            >
              <Plus size={16} /> Create Node
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            Remote VPS machines that run the node daemon and connect back to this panel over your Cloudflare Tunnel. If no node has been created yet, Create Server automatically falls back to this panel's own machine (the Local Node, configured under the Playit/Node tab).
          </p>

          {nodesMsg && (
            <div className={`p-4 rounded-xl mb-6 flex items-start gap-3 text-sm font-medium ${nodesMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-amber-500/10 border border-amber-500/30 text-amber-400"}`}>
              {nodesMsg.type === "success" ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
              <span>{nodesMsg.text}</span>
            </div>
          )}

          {nodes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border-subtle rounded-2xl">
              No nodes created yet. Server creation is currently using the Local Node.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-4 font-semibold">Name</th>
                    <th className="px-6 py-4 font-semibold">Location</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Memory</th>
                    <th className="px-6 py-4 font-semibold">Disk</th>
                    <th className="px-6 py-4 font-semibold">Servers</th>
                    <th className="px-6 py-4 font-semibold">SSL</th>
                    <th className="px-6 py-4 font-semibold">Public</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((n: any) => (
                    <tr key={n.id} className="border-t border-border-subtle hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => openNodeDetail(n.id)}>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {n.name}
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">{n.fqdn}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{n.location || "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${n.status === "connected" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30"}`}>
                          {n.status === "connected" ? <Wifi size={12} /> : <WifiOff size={12} />}
                          {n.status === "connected" ? "Connected" : "Not Connected"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{n.memory ? `${n.memory} MB` : "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{n.disk ? `${n.disk} MB` : "—"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{dashServers.filter((s: any) => s.nodeId === n.id).length}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          Enabled
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${n.tunnelConfigured ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30"}`}>
                          {n.tunnelConfigured ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteNode(n.id); }}
                          className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Delete node"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Create Node form */}
          {showCreateNode && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateNode(false)}>
              <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-foreground flex items-center"><Server className="mr-2.5 text-theme-400 w-5 h-5" /> Create Node</h3>
                  <button onClick={() => setShowCreateNode(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleCreateNode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Name</label>
                    <input required value={newNodeName} onChange={(e) => setNewNodeName(e.target.value)} type="text" placeholder="US-East-1" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">FQDN (tunnel domain)</label>
                    <input required value={newNodeFqdn} onChange={(e) => setNewNodeFqdn(e.target.value)} type="text" placeholder="node1.mydomain.com" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Location</label>
                    <input value={newNodeLocation} onChange={(e) => setNewNodeLocation(e.target.value)} type="text" placeholder="US East, Frankfurt, etc." className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Memory Limit (MB)</label>
                      <input value={newNodeMemory} onChange={(e) => setNewNodeMemory(e.target.value)} type="number" placeholder="16384" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Disk Limit (MB)</label>
                      <input value={newNodeDisk} onChange={(e) => setNewNodeDisk(e.target.value)} type="number" placeholder="102400" className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none" />
                    </div>
                  </div>
                  <button type="submit" disabled={isCreatingNode} className="w-full bg-theme-500 hover:bg-theme-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50">
                    {isCreatingNode ? "Creating..." : "Create Node"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Node detail: Configuration + Allocations */}
          {selectedNodeId && selectedNode && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setSelectedNodeId(null); setSelectedNode(null); }}>
              <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedNode.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedNode.fqdn}</p>
                  </div>
                  <button onClick={() => { setSelectedNodeId(null); setSelectedNode(null); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex gap-1.5 mb-6 bg-muted-subtle p-1 rounded-xl w-fit">
                  {[{ key: "config", label: "Configuration" }, { key: "allocations", label: "Allocations" }].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setNodeDetailTab(t.key as any)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${nodeDetailTab === t.key ? "bg-theme-500 text-white" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {nodeDetailTab === "config" && (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${selectedNode.status === "connected" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-zinc-500/10 border border-zinc-500/30 text-zinc-400"}`}>
                      {selectedNode.status === "connected" ? <Wifi size={18} /> : <WifiOff size={18} />}
                      <span>{selectedNode.status === "connected" ? "Connected — daemon last checked in " + new Date(selectedNode.daemon?.lastHeartbeat).toLocaleString() : "Not Connected — run the installer's \"Install Node\" option on the target VPS with the values below."}</span>
                    </div>

                    {selectedNode.tunnelMessage && (
                      <p className="text-xs text-muted-foreground">{selectedNode.tunnelMessage}</p>
                    )}

                    {[
                      { label: "Node UUID", value: selectedNode.id, field: "id" },
                      { label: "Token ID", value: selectedNode.tokenId, field: "tokenId" },
                      { label: "Token", value: selectedNode.token, field: "token" },
                      { label: "Panel URL", value: `https://${selectedNode.fqdn}`, field: "panelUrl" },
                    ].map((row) => (
                      <div key={row.field}>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">{row.label}</label>
                        <div className="flex items-center gap-2">
                          <input readOnly value={row.value} className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-foreground font-mono text-xs outline-none" />
                          <button onClick={() => copyToClipboard(row.value, row.field)} className="p-2.5 bg-muted border border-border hover:border-theme-500/40 hover:text-theme-400 rounded-xl transition-all shrink-0" title="Copy">
                            {copiedField === row.field ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {nodeDetailTab === "allocations" && (
                  <div>
                    {allocMsg && (
                      <div className={`p-3 rounded-xl mb-4 flex items-center gap-2 text-xs font-medium ${allocMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                        {allocMsg.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        <span>{allocMsg.text}</span>
                      </div>
                    )}
                    <form onSubmit={handleCreateAllocations} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 items-end">
                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">IP Address</label>
                        <input required value={allocIp} onChange={(e) => setAllocIp(e.target.value)} type="text" placeholder="203.0.113.42" className="w-full bg-muted border border-border focus:border-theme-500 rounded-xl px-3 py-2.5 text-foreground font-mono text-xs outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">From</label>
                        <input required value={allocFrom} onChange={(e) => setAllocFrom(e.target.value)} type="number" placeholder="25565" className="w-full bg-muted border border-border focus:border-theme-500 rounded-xl px-3 py-2.5 text-foreground font-mono text-xs outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">To</label>
                        <input required value={allocTo} onChange={(e) => setAllocTo(e.target.value)} type="number" placeholder="25665" className="w-full bg-muted border border-border focus:border-theme-500 rounded-xl px-3 py-2.5 text-foreground font-mono text-xs outline-none" />
                      </div>
                      <button type="submit" disabled={isCreatingAlloc} className="bg-theme-500 hover:bg-theme-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 text-sm">
                        {isCreatingAlloc ? "Creating..." : "Create Allocations"}
                      </button>
                    </form>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {nodeAllocations.length === 0 && <p className="text-sm text-muted-foreground">No allocations yet.</p>}
                      {nodeAllocations.map((a: any) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-muted-subtle border border-border-subtle rounded-xl">
                          <span className="font-mono text-sm text-foreground">{a.ip}:{a.port}</span>
                          <div className="flex items-center gap-2">
                            {a.assigned && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-theme-500/10 text-theme-400 border border-theme-500/30">In use</span>}
                            <button onClick={() => handleDeleteAllocation(a.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Delete allocation">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {user.role === "admin" && activeTab === "traffic" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
            <h2 className="text-xl font-bold flex items-center text-foreground">
              <Ban className="mr-3 text-theme-400 w-6 h-6" /> Traffic
            </h2>
            <button
              onClick={fetchTraffic}
              className="flex items-center gap-2 bg-muted hover:bg-muted-hover text-foreground font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] text-sm border border-border-subtle"
            >
              <RefreshCw size={16} className={trafficLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            Live requests-per-minute per IP address, tracked in-memory since the panel last restarted ({trafficTrackedIps} IPs tracked). If an IP is flooding the panel (DDoS / brute-force), block it here — blocked IPs are rejected before they reach any route.
          </p>

          {/* Manual block form */}
          <form onSubmit={submitManualBan} className="flex flex-col sm:flex-row gap-3 mb-8">
            <input
              required
              value={manualBanIp}
              onChange={(e) => setManualBanIp(e.target.value)}
              type="text"
              placeholder="IP address to block (e.g. 203.0.113.42)"
              className="flex-1 bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground font-mono text-sm transition-all shadow-inner outline-none"
            />
            <input
              value={manualBanReason}
              onChange={(e) => setManualBanReason(e.target.value)}
              type="text"
              placeholder="Reason (optional)"
              className="flex-1 bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-2.5 text-foreground transition-all shadow-inner outline-none"
            />
            <button
              disabled={isManualBanning}
              type="submit"
              className="bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98] whitespace-nowrap disabled:opacity-50"
            >
              {isManualBanning ? "Blocking..." : "Block IP"}
            </button>
          </form>

          {/* Top traffic table */}
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Activity size={15} className="text-theme-400" /> Top Traffic (last minute)
          </h3>
          {trafficRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border-subtle rounded-2xl mb-8">
              No traffic recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border-subtle mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-4 font-semibold">IP Address</th>
                    <th className="px-6 py-4 font-semibold">Requests / min</th>
                    <th className="px-6 py-4 font-semibold">Total Requests</th>
                    <th className="px-6 py-4 font-semibold">Last Seen</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficRows.map((r: any) => {
                    const isBanned = bannedIps.some((b: any) => b.ip === r.ip);
                    const isHot = r.requestsPerMinute >= 120;
                    return (
                      <tr key={r.ip} className="border-t border-border-subtle hover:bg-muted/40 transition-colors">
                        <td className="px-6 py-4 font-mono text-foreground">{r.ip}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${isHot ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-muted text-muted-foreground border border-border-subtle"}`}>
                            {r.requestsPerMinute}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{r.totalRequests}</td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">{r.lastSeen ? new Date(r.lastSeen).toLocaleTimeString() : "—"}</td>
                        <td className="px-6 py-4 text-right">
                          {isBanned ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 bg-red-500/10 rounded-lg">
                              <Ban size={13} /> Blocked
                            </span>
                          ) : (
                            <button
                              onClick={() => blockIpFromTraffic(r.ip)}
                              className="px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                            >
                              Block
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Blocked IPs list */}
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Ban size={15} className="text-red-400" /> Blocked IP Addresses ({bannedIps.length})
          </h3>
          {bannedIps.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border-subtle rounded-2xl">
              No IPs blocked yet.
            </div>
          ) : (
            <div className="space-y-2">
              {bannedIps.map((b: any) => (
                <div key={b.ip} className="flex items-center justify-between p-3 bg-muted-subtle border border-border-subtle rounded-xl">
                  <div>
                    <p className="font-mono text-sm text-foreground">{b.ip}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{b.reason || "No reason given"}{b.bannedBy ? ` • by ${b.bannedBy}` : ""}</p>
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
          )}
        </div>
      )}

      {user.role === "admin" && activeTab === "activity" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
            <h2 className="text-xl font-bold flex items-center text-foreground">
              <Activity className="mr-3 text-theme-400 w-6 h-6" /> Activity Log
            </h2>
            <button
              onClick={fetchActivity}
              className="flex items-center gap-2 bg-muted hover:bg-muted-hover text-foreground font-semibold px-4 py-2.5 rounded-xl transition-all text-sm"
            >
              <RefreshCw size={16} className={activityLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            A running audit trail of logins, server power actions, server creation/deletion, and database/schedule changes across the whole panel.
          </p>

          {activityLoading && activityEntries.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="w-6 h-6 text-theme-500 animate-spin mx-auto" />
            </div>
          ) : activityEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border-subtle rounded-2xl">
              No activity recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Server</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {activityEntries.map((e: any) => (
                    <tr key={e.id} className="border-t border-border-subtle hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{e.username}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.serverName || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-theme-400">{e.action}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.description}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.ip || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {user.role === "admin" && activeTab === "support" && (
        <div className="bg-card border border-border-subtle rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden mb-8">
          <h2 className="text-xl font-bold flex items-center text-foreground mb-2">
            <LifeBuoy className="mr-3 text-theme-400 w-6 h-6" /> Support Tickets
          </h2>
          <p className="text-xs text-muted-foreground mb-6 max-w-2xl">
            Conversations users have escalated from the AI support chat. Claim a ticket to take it over, reply with text or a screenshot, and close it once resolved.
          </p>
          <SupportTicketsAdmin />
        </div>
      )}

      {user.role === "admin" && activeTab === "extensions" && (
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

      {user.role === "admin" && activeTab === "users" && (
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
      </div>
    </div>
  );
}
