import React, { useEffect, useState } from "react";
import { LoadingOverlay } from "../components/LoadingOverlay";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  ArrowLeft,
  Cpu,
  HardDrive,
  MemoryStick,
  Globe,
  User,
  AlertTriangle,
  Sparkles,
  Check,
  Box,
  CheckCircle2,
  Clock
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import SearchableDropdown from "../components/SearchableDropdown";

export default function CreateServer({ onBack, onCreated }: { onBack?: () => void; onCreated?: () => void } = {}) {
  const [name, setName] = useState("");
  const [ram, setRam] = useState<string>("4");
  const [cpu, setCpu] = useState<string>("150");
  const [disk, setDisk] = useState<string>("10");
  const [port, setPort] = useState<string>("25565");
  const [nodeIp, setNodeIp] = useState<string>("");
  const [nodeMode, setNodeMode] = useState<"local" | "select">("local");
  const [availableNodes, setAvailableNodes] = useState<any[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [allocationId, setAllocationId] = useState<string>("");
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [ipAlias, setIpAlias] = useState<string>("");
  const [eggs, setEggs] = useState<any[]>([]);
  const [category, setCategory] = useState<string>("");
  const [eggId, setEggId] = useState<string>("");
  const [version, setVersion] = useState("");
  const [owner, setOwner] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createProgress, setCreateProgress] = useState(0);
  const [totalSystemRam, setTotalSystemRam] = useState<number>(0);
  const [showRamWarning, setShowRamWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSuspendOption, setAutoSuspendOption] = useState<string>("never");
  const [customExpiration, setCustomExpiration] = useState<string>("");

  const categories = Array.from(new Set(eggs.map((e: any) => e.category)));
  const eggsInCategory = eggs.filter((e: any) => e.category === category);
  const selectedEgg = eggs.find((e: any) => e.id === eggId);

  const navigate = useNavigate();
  const { user } = useAuth();

  const ramPresets = [2, 4, 8, 16, 24, 32, 48, 64];

  const handleRamSelect = (val: number) => {
    setRam(val.toString());
    let autoCpu = 100;
    if (val <= 2) autoCpu = 100;
    else if (val <= 4) autoCpu = 150;
    else if (val <= 8) autoCpu = 200;
    else if (val <= 16) autoCpu = 300;
    else if (val <= 24) autoCpu = 400;
    else if (val <= 32) autoCpu = 500;
    else if (val <= 48) autoCpu = 600;
    else if (val <= 64) autoCpu = 800;
    setCpu(autoCpu.toString());
  };

  // Load available eggs (server templates) and default to the first category.
  useEffect(() => {
    axios.get("/api/eggs").then((res) => {
      setEggs(res.data);
      if (res.data.length > 0) {
        setCategory(res.data[0].category);
      }
    }).catch(() => {});
  }, []);

  // If at least one real (remote) Node has been created in Admin -> Nodes,
  // require picking one of them and auto-fill the next free allocation from
  // it. Otherwise fall back to the existing Local Node behaviour (the
  // panel's own IP + configured port range).
  useEffect(() => {
    axios.get("/api/nodes/available/for-server").then((res) => {
      if (res.data.mode === "select") {
        setNodeMode("select");
        setAvailableNodes(res.data.nodes || []);
        const first = (res.data.nodes || [])[0];
        if (first) setSelectedNodeId(first.id);
      } else {
        setNodeMode("local");
        if (res.data.nodeIp) setNodeIp(res.data.nodeIp);
      }
    }).catch(() => {});
  }, []);

  // Local Node fallback: auto-fill the next free port from the configured
  // range, same as before.
  useEffect(() => {
    if (nodeMode !== "local") return;
    axios.get("/api/system/next-port").then((res) => {
      if (res.data.available) {
        setPort(String(res.data.port));
        setNodeIp(res.data.nodeIp || "");
      }
    }).catch(() => {});
  }, [nodeMode]);

  // Real node selected: fetch the next free allocation on it (ip:port).
  useEffect(() => {
    if (nodeMode !== "select" || !selectedNodeId) return;
    setNodeError(null);
    axios.get(`/api/nodes/${selectedNodeId}/next-allocation`).then((res) => {
      if (res.data.available) {
        setNodeIp(res.data.ip);
        setPort(String(res.data.port));
        setAllocationId(res.data.allocationId);
      } else {
        setAllocationId("");
        setNodeError(res.data.message || "No free allocations on this node.");
      }
    }).catch(() => {});
  }, [nodeMode, selectedNodeId]);

  // When the category changes, select the first egg in it.
  useEffect(() => {
    const firstInCategory = eggs.find((e: any) => e.category === category);
    setEggId(firstInCategory ? firstInCategory.id : "");
  }, [category, eggs]);

  // When the selected egg changes, default (or clear) the version dropdown.
  // Versions are listed oldest -> latest, so the newest is the last entry.
  useEffect(() => {
    if (selectedEgg && selectedEgg.versions && selectedEgg.versions.length > 0) {
      setVersion(selectedEgg.versions[selectedEgg.versions.length - 1]);
    } else {
      setVersion("");
    }
  }, [eggId]);

  useEffect(() => {
    axios
      .get("/api/system/stats")
      .then((res) => {
        setTotalSystemRam(res.data.totalMemory / (1024 * 1024 * 1024));
      })
      .catch(() => {});

    axios
      .get("/api/auth/users")
      .then((res) => {
        setUsers(res.data);
        if (res.data.length > 0) {
          const defaultOwner =
            res.data.find((u: any) => u.id === user?.id)?.id || res.data[0].id;
          setOwner(defaultOwner);
        }
      })
      .catch(() => {});
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nodeMode === "select" && !allocationId) {
      setNodeError("No free allocation available on this node — add more under Admin -> Nodes -> Allocations, or pick another node.");
      return;
    }
    if (totalSystemRam > 0 && Number(ram) > totalSystemRam && !showRamWarning) {
      setShowRamWarning(true);
      return;
    }
    executeSubmit();
  };

  const executeSubmit = async () => {
    setShowRamWarning(false);
    setLoading(true);
    setCreateProgress(0);
    setError(null);

    const interval = setInterval(() => {
      setCreateProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + (Math.random() * 8 + 2);
      });
    }, 300);

    try {
      const payload: any = {
        name,
        ram: Number(ram),
        cpu: Number(cpu),
        disk: Number(disk),
        port: Number(port),
        ipAlias,
        eggId,
      };
      if (nodeMode === "select") {
        payload.nodeId = selectedNodeId;
        payload.allocationId = allocationId;
      }
      if (version) payload.version = version;
      if (owner) payload.owner = owner;

      // Auto-suspension: mirrors the "SAGA AutoSuspension" idea — set an
      // expiration date now, and a background job suspends the server
      // automatically once it passes (adjustable later from Server Settings).
      if (autoSuspendOption === "custom" && customExpiration) {
        payload.expirationDate = new Date(customExpiration).toISOString();
      } else if (autoSuspendOption !== "never") {
        const days = Number(autoSuspendOption);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);
        payload.expirationDate = expiry.toISOString();
      }

      await axios.post("/api/servers", payload);
      clearInterval(interval);
      setCreateProgress(100);
      setTimeout(() => { if (onCreated) onCreated(); else navigate("/servers"); }, 800);
    } catch (e: any) {
      clearInterval(interval);
      setCreateProgress(0);
      setError(e.response?.data?.error || "Failed to create server instance");
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full max-w-3xl mx-auto relative z-10"
    >
      <div className="mb-10">
        {onBack ? (
          <button type="button" onClick={onBack} className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft size={16} className="mr-2" /> Back to Instances
          </button>
        ) : (
          <Link to="/servers" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft size={16} className="mr-2" /> Back to Instances
          </Link>
        )}
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2">Deploy Instance</h1>
        <p className="text-muted-foreground">Configure parameters for a new Minecraft container.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="bg-card p-6 md:p-8 rounded-2xl border border-border-subtle shadow-2xl relative">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-theme-500/5 blur-[100px] rounded-full" />
        </div>

        <div className="space-y-8 relative z-10">
          <div>
            <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
              <Server className="w-4 h-4 mr-2 text-theme-400" /> Instance Name
            </label>
            <input 
              type="text" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none"
              placeholder="e.g. Production Survival"
            />
          </div>

          {nodeMode === "select" && (
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
                <Server className="w-4 h-4 mr-2 text-theme-400" /> Node
              </label>
              <select
                required
                value={selectedNodeId}
                onChange={e => setSelectedNodeId(e.target.value)}
                className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none"
              >
                {availableNodes.map((n: any) => (
                  <option key={n.id} value={n.id} disabled={n.freeAllocations === 0}>
                    {n.name} ({n.fqdn}) — {n.status === "connected" ? "Connected" : "Not Connected"} — {n.freeAllocations} free allocation{n.freeAllocations === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              {nodeError && (
                <p className="mt-2 text-sm text-red-400 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                  {nodeError}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted-subtle p-5 rounded-2xl border border-border-subtle">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-foreground-muted mb-3 flex items-center">
                <MemoryStick className="w-4 h-4 mr-2 text-purple-400" /> RAM Allocation (GB)
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-3">
                {ramPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleRamSelect(preset)}
                    className={`py-2 px-1 rounded-lg text-sm font-medium transition-all border ${
                      ram === preset.toString()
                        ? "bg-theme-500/20 border-theme-500/50 text-theme-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                        : "bg-muted border-border text-muted-foreground hover:border-border-strong hover:bg-muted"
                    }`}
                  >
                    {preset}GB
                  </button>
                ))}
              </div>
              <input 
                type="number" 
                required 
                min={1}
                value={ram} 
                onChange={e => setRam(e.target.value)} 
                className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
                <Cpu className="w-4 h-4 mr-2 text-blue-400" /> CPU Limit (%)
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  required 
                  min={10}
                  value={cpu} 
                  onChange={e => setCpu(e.target.value)} 
                  className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none font-mono"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="text-[10px] bg-theme-500/20 text-theme-300 px-2 py-0.5 rounded-full border border-theme-500/30 font-bold">
                    AUTO
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-400" /> 
                Auto-optimized for {ram}GB
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
                <HardDrive className="w-4 h-4 mr-2 text-emerald-400" /> Disk Limit (GB)
              </label>
              <input 
                type="number" 
                required 
                min={1}
                value={disk} 
                onChange={e => setDisk(e.target.value)} 
                className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none font-mono"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 flex items-center ${error?.includes("Port") ? "text-red-400" : "text-foreground-muted"}`}>
                 <Globe className={`w-4 h-4 mr-2 ${error?.includes("Port") ? "text-red-400" : "text-orange-400"}`} /> Network Port
              </label>
              <input 
                type="number" 
                required 
                readOnly={nodeMode === "select"}
                value={port} 
                onChange={e => { if (nodeMode !== "select") { setPort(e.target.value); setError(null); } }} 
                className={`w-full bg-muted-subtle border focus:ring-1 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none font-mono ${nodeMode === "select" ? "opacity-70 cursor-not-allowed" : ""} ${error?.includes("Port") ? "border-red-500 focus:border-red-500 focus:ring-red-500/50" : "border-border focus:border-theme-500 focus:ring-theme-500/50"}`}
              />
              {nodeMode === "select" && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">Auto-assigned from the selected node's next free allocation.</p>
              )}
              {error?.includes("Port") && (
                <p className="mt-2 text-sm text-red-400 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                  {error}
                </p>
              )}
              {nodeIp && port && !error?.includes("Port") && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Players will connect at: <span className="font-mono text-foreground">{nodeIp}:{port}</span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
                 <Globe className="w-4 h-4 mr-2 text-theme-400" /> IP Alias
              </label>
              <input 
                type="text" 
                value={ipAlias} 
                onChange={e => setIpAlias(e.target.value)} 
                placeholder="e.g. play.example.com"
                className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none font-mono"
              />
            </div>
          </div>

          <div className="md:col-span-2 relative z-20">
            <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
              <User className="w-4 h-4 mr-2 text-theme-400" /> Assign Server Owner
            </label>
            <SearchableDropdown
              value={owner}
              onChange={setOwner}
              options={users.map(u => ({ value: u.id, label: `${u.username} ${u.id === user?.id ? "(You)" : `(${u.role})`}` }))}
              placeholder="Select a user..."
              searchPlaceholder="Search users..."
            />
            <p className="text-xs text-muted-foreground mt-2">Select which user owns and has access to this server.</p>
          </div>

          <div className="md:col-span-2 relative z-10">
            <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-theme-400" /> Auto-Suspend
            </label>
            <select
              value={autoSuspendOption}
              onChange={(e) => setAutoSuspendOption(e.target.value)}
              className="w-full bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none"
            >
              <option value="never">Never (no expiration)</option>
              <option value="1">Suspend after 1 day</option>
              <option value="3">Suspend after 3 days</option>
              <option value="7">Suspend after 7 days</option>
              <option value="30">Suspend after 30 days</option>
              <option value="custom">Custom date...</option>
            </select>
            {autoSuspendOption === "custom" && (
              <input
                type="datetime-local"
                value={customExpiration}
                onChange={(e) => setCustomExpiration(e.target.value)}
                className="w-full mt-2 bg-muted-subtle border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl px-4 py-3 text-foreground transition-all shadow-inner outline-none"
              />
            )}
            <p className="text-xs text-muted-foreground mt-2">The server will be automatically suspended once this date passes. You can change this anytime from the server's Settings tab.</p>
          </div>

          <div className="md:col-span-2 relative z-10">
            <label className="block text-sm font-medium text-foreground-muted mb-3 flex items-center">
              <Box className="w-4 h-4 mr-2 text-theme-400" /> Category
            </label>
            {eggs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eggs available yet — upload one in Settings first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                        isSelected
                          ? "bg-theme-500/20 border-theme-500/50 text-theme-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                          : "bg-muted-subtle border-border-subtle text-foreground-muted hover:border-border-strong hover:bg-muted"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {eggsInCategory.length > 0 && (
            <div className="md:col-span-2 relative z-10">
              <label className="block text-sm font-medium text-foreground-muted mb-3 flex items-center">
                <Box className="w-4 h-4 mr-2 text-theme-400" /> Server Software
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {eggsInCategory.map((egg: any) => {
                  const isSelected = eggId === egg.id;
                  return (
                    <button
                      key={egg.id}
                      type="button"
                      onClick={() => setEggId(egg.id)}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 relative overflow-hidden group ${
                        isSelected
                          ? "bg-theme-500/10 border-theme-500/30 ring-1 ring-theme-500/50 shadow-lg"
                          : "bg-muted-subtle border-border-subtle hover:border-border-strong hover:bg-muted"
                      }`}
                    >
                      <Box className={`w-7 h-7 mb-2 ${isSelected ? "text-theme-400" : "text-muted-foreground group-hover:text-foreground-muted"} transition-colors relative z-10`} />
                      <span className={`text-sm font-bold relative z-10 ${isSelected ? "text-foreground" : "text-foreground-muted"}`}>{egg.name}</span>
                      <span className="text-[10px] text-center mt-1 relative z-10 text-muted-foreground truncate max-w-full">{egg.dockerImage}</span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 text-theme-400">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedEgg && selectedEgg.versions && selectedEgg.versions.length > 0 && (
            <div className="md:col-span-2 relative z-10">
              <label className="block text-sm font-medium text-foreground-muted mb-2 flex items-center">
                <Box className="w-4 h-4 mr-2 text-cyan-400" /> Software Version
              </label>
              <SearchableDropdown
                value={version}
                onChange={setVersion}
                options={selectedEgg.versions.map((v: string) => ({ value: v, label: v }))}
                placeholder="Select a version..."
                searchPlaceholder="Search versions..."
                className="font-mono"
              />
            </div>
          )}

          <div className="pt-4 border-t border-border-subtle md:col-span-2">
             {loading && (
               <div className="mb-6 p-4 border border-zinc-800 bg-muted rounded-xl">
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-sm font-medium text-theme-400">Downloading {version} and creating container...</span>
                   <span className="text-sm font-mono text-theme-400/80">{Math.round(createProgress)}%</span>
                 </div>
                 <div className="w-full bg-zinc-800/50 rounded-full h-2.5 overflow-hidden">
                   <div 
                     className="bg-theme-500 h-2.5 rounded-full transition-all duration-300 ease-out" 
                     style={{ width: `${createProgress}%` }}
                   ></div>
                 </div>
               </div>
             )}
             {error && !error.includes("Port") && (
               <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start text-red-400 mb-6">
                 <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
                 <p className="text-sm font-medium whitespace-pre-wrap font-mono">{error}</p>
               </div>
             )}
             
             <button 
                type="submit" 
                disabled={loading}
                className="w-full px-4 py-3.5 bg-white text-zinc-900 hover:bg-zinc-200 font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-zinc-900 border-t-transparent rounded-full mr-2" />
                    Deploying Instance...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Launch Instance
                  </>
                )}
             </button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        {showRamWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#121214] border border-red-500/30 shadow-2xl shadow-red-500/10 rounded-2xl p-6 max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500" />
              <div className="flex items-start mb-4">
                <div className="bg-red-500/10 p-3 rounded-full mr-4">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-1">High RAM Allocation</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    You are attempting to allocate <strong className="text-foreground">{ram}GB</strong> of RAM, but this system only has <strong className="text-foreground">{totalSystemRam.toFixed(1)}GB</strong> physically available. 
                  </p>
                  <p className="text-muted-foreground text-sm leading-relaxed mt-2">
                    The server has been configured to use memory on-demand, but if it actually consumes more than the available physical RAM during runtime, the host operating system may forcibly terminate (crash) it to prevent system instability.
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRamWarning(false)}
                  className="px-4 py-2 bg-muted hover:bg-muted-hover text-foreground font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeSubmit}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-xl transition-colors border border-red-500/30"
                >
                  Yes, Proceed Anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {(loading) && <LoadingOverlay message="Provisioning server resources..." />}
    </motion.div>
  );
}
