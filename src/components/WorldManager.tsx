import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  Globe2, Upload, Download, Trash2, AlertTriangle, Star,
  Search, Archive, Shield, Gamepad2, Swords,
  Save, Loader2, Compass, Settings2,
} from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import { useNotification } from "../context/NotificationContext";

interface World {
  name: string;
  bedrockStyle: boolean;
  active: boolean;
  modifiedAt: string;
  worldName?: string;
  worldVersion?: string;
  dataVersion?: number;
}

interface CFWorld {
  id: number;
  name: string;
  summary: string;
  author: string;
  logo: string | null;
  downloadCount: number;
  websiteUrl?: string;
}

type Properties = { [key: string]: string };

const GAME_RULES: { key: string; label: string; hint: string; type: "boolean" | "number"; default: string }[] = [
  { key: "keepInventory", label: "Keep Inventory", hint: "Players keep items on death", type: "boolean", default: "false" },
  { key: "doDaylightCycle", label: "Daylight Cycle", hint: "Time progresses normally", type: "boolean", default: "true" },
  { key: "doWeatherCycle", label: "Weather Cycle", hint: "Weather changes over time", type: "boolean", default: "true" },
  { key: "doMobSpawning", label: "Mob Spawning", hint: "Mobs spawn naturally", type: "boolean", default: "true" },
  { key: "mobGriefing", label: "Mob Griefing", hint: "Mobs can break/modify blocks", type: "boolean", default: "true" },
  { key: "doFireTick", label: "Fire Spread", hint: "Fire spreads to adjacent blocks", type: "boolean", default: "true" },
  { key: "naturalRegeneration", label: "Natural Regeneration", hint: "Players regenerate health naturally", type: "boolean", default: "true" },
  { key: "doMobLoot", label: "Mob Loot", hint: "Mobs drop items on death", type: "boolean", default: "true" },
  { key: "doTileDrops", label: "Block Drops", hint: "Blocks drop items when broken", type: "boolean", default: "true" },
  { key: "announceAdvancements", label: "Advancements Chat", hint: "Advancement messages show in chat", type: "boolean", default: "true" },
];

const GAME_RULE_NUMBERS: { key: string; label: string; hint: string; default: string }[] = [
  { key: "randomTickSpeed", label: "Random Tick Speed", hint: "Speed of crop growth / leaf decay (default 3)", default: "3" },
  { key: "spawnRadius", label: "Spawn Radius", hint: "Radius around world spawn point", default: "10" },
  { key: "maxEntityCramming", label: "Entity Cramming", hint: "Max entities in one block before damage (0 = off)", default: "24" },
];

function PillGroup({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            value === opt.value
              ? "bg-white text-black shadow"
              : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 md:p-5 ring-1 ring-border-subtle">
      <div className="flex items-center gap-2 mb-3 text-sm font-bold text-foreground">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function NumberSaveField({ label, hint, value, onChange, onSave, saving, placeholder }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; onSave: () => void; saving: boolean; placeholder?: string;
}) {
  return (
    <div className="bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 md:p-5 ring-1 ring-border-subtle">
      <div className="mb-2">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-black/60 border border-border focus:border-theme-500 rounded-xl px-3.5 py-2 text-sm font-medium text-foreground outline-none shadow-inner transition-colors"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-xs font-bold bg-theme-500/10 hover:bg-theme-500/20 text-theme-400 rounded-lg transition-colors disabled:opacity-50 shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 flex items-center justify-between gap-3 ring-1 ring-border-subtle">
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${checked ? "bg-theme-500" : "bg-zinc-700"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export default function WorldManager({ serverId, server }: { serverId: string; server: any }) {
  const { notify } = useNotification();
  const [tab, setTab] = useState<"browse" | "manage">("manage");
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyWorld, setBusyWorld] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBedrock = (server?.type || "").toUpperCase() === "BEDROCK";

  // World Settings (server.properties)
  const [props, setProps] = useState<Properties>({});
  const [propsOriginal, setPropsOriginal] = useState<string>("");
  const [propsExist, setPropsExist] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Game Rules
  const [rules, setRules] = useState<Record<string, string>>({});
  const [rulesWorldName, setRulesWorldName] = useState<string | null>(null);
  const [savingRules, setSavingRules] = useState(false);

  // Browse Worlds
  const [query, setQuery] = useState("");
  const [cfWorlds, setCfWorlds] = useState<CFWorld[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    axios
      .get(`/api/servers/${serverId}/worlds`)
      .then((res) => setWorlds(res.data.worlds || []))
      .catch(() => notify("Failed to load worlds.", "error"))
      .finally(() => setLoading(false));
  };

  const loadProps = () => {
    axios.get(`/api/servers/${serverId}/files?path=server.properties`).then((res) => {
      if (res.data.isFile) {
        setPropsOriginal(res.data.content);
        setProps(parseProperties(res.data.content));
        setPropsExist(true);
      } else {
        setPropsExist(false);
      }
    }).catch(() => setPropsExist(false));
  };

  const loadRules = () => {
    if (isBedrock) return;
    axios.get(`/api/servers/${serverId}/worlds/gamerules`).then((res) => {
      setRules(res.data.rules || {});
      setRulesWorldName(res.data.worldName || null);
    }).catch(() => {});
  };

  const searchCurseForge = (q: string, page = 0) => {
    setCfLoading(true);
    setCfError(null);
    axios.get(`/api/servers/curseforge/worlds/search`, { params: { q, page } })
      .then((res) => setCfWorlds(res.data.worlds || []))
      .catch((e) => setCfError(e.response?.data?.error || "Failed to search CurseForge."))
      .finally(() => setCfLoading(false));
  };

  useEffect(() => {
    load();
    loadProps();
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  useEffect(() => {
    if (tab === "browse" && cfWorlds.length === 0 && !cfLoading && !cfError) {
      searchCurseForge("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const parseProperties = (content: string): Properties => {
    const lines = content.split("\n");
    const parsed: Properties = {};
    for (const line of lines) {
      if (line.startsWith("#") || !line.trim()) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      parsed[line.substring(0, index).trim()] = line.substring(index + 1).trim();
    }
    return parsed;
  };

  const serializeProperties = (currentProps: Properties, originalText: string): string => {
    const lines = originalText.split("\n");
    const updatedKeys = new Set<string>();
    const updatedLines = lines.map((line) => {
      if (line.startsWith("#") || !line.trim()) return line;
      const index = line.indexOf("=");
      if (index === -1) return line;
      const key = line.substring(0, index).trim();
      if (currentProps[key] !== undefined) {
        updatedKeys.add(key);
        return `${key}=${currentProps[key]}`;
      }
      return line;
    });
    for (const [key, value] of Object.entries(currentProps)) {
      if (!updatedKeys.has(key)) updatedLines.push(`${key}=${value}`);
    }
    return updatedLines.join("\n");
  };

  const savePropertyKey = async (key: string) => {
    setSavingKey(key);
    try {
      const newContent = serializeProperties(props, propsOriginal);
      await axios.post(`/api/servers/${serverId}/files/save`, { filePath: "server.properties", content: newContent });
      setPropsOriginal(newContent);
      notify("Saved. Changes apply on next restart.", "success");
    } catch (e) {
      notify("Failed to save setting.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  const setPropAndSave = (key: string, value: string) => {
    setProps((prev) => {
      const next = { ...prev, [key]: value };
      const newContent = serializeProperties(next, propsOriginal);
      axios.post(`/api/servers/${serverId}/files/save`, { filePath: "server.properties", content: newContent })
        .then(() => { setPropsOriginal(newContent); notify("Saved. Changes apply on next restart.", "success"); })
        .catch(() => notify("Failed to save setting.", "error"));
      return next;
    });
  };

  const saveRules = async () => {
    setSavingRules(true);
    try {
      const res = await axios.put(`/api/servers/${serverId}/worlds/gamerules`, { rules });
      setRulesWorldName(res.data.worldName || null);
      notify("Game rules saved as a datapack. They apply automatically on the next server start.", "success");
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to save game rules.", "error");
    } finally {
      setSavingRules(false);
    }
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("worldName", file.name.replace(/\.zip$/i, ""));
      formData.append("bedrockStyle", String(isBedrock));
      await axios.post(`/api/servers/${serverId}/worlds/upload`, formData);
      notify("World uploaded.", "success");
      load();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to upload world.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleInstallCf = async (world: CFWorld) => {
    setInstallingId(world.id);
    try {
      await axios.post(`/api/servers/${serverId}/worlds/install-curseforge`, { modId: world.id, worldName: world.name });
      notify(`"${world.name}" installed. Switch to it below or set it active.`, "success");
      load();
      setTab("manage");
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to install world.", "error");
    } finally {
      setInstallingId(null);
    }
  };

  const handleSwitch = async (worldName: string) => {
    setBusyWorld(worldName);
    try {
      await axios.put(`/api/servers/${serverId}/worlds/active`, { worldName });
      notify(`Active world set to "${worldName}". Restart the server to load it.`, "success");
      load();
      loadRules();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to switch world.", "error");
    } finally {
      setBusyWorld(null);
    }
  };

  const handleDownload = (world: World) => {
    const url = `/api/servers/${serverId}/worlds/download?worldName=${encodeURIComponent(world.name)}&bedrockStyle=${world.bedrockStyle}`;
    axios.get(url, { responseType: "blob" }).then((res) => {
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${world.name}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    }).catch(() => notify("Failed to download world.", "error"));
  };

  const handleBackup = async (world: World) => {
    setBusyWorld(world.name);
    try {
      await axios.post(`/api/servers/${serverId}/backups`);
      notify(`Backup created. Find it under the server's Backups tab.`, "success");
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to create backup.", "error");
    } finally {
      setBusyWorld(null);
    }
  };

  const handleDelete = async (world: World) => {
    if (!confirm(`Delete world "${world.name}"? This cannot be undone.`)) return;
    setBusyWorld(world.name);
    try {
      await axios.delete(`/api/servers/${serverId}/worlds`, { data: { worldName: world.name, bedrockStyle: world.bedrockStyle } });
      load();
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to delete world.", "error");
    } finally {
      setBusyWorld(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-theme-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Globe2 className="w-6 h-6 text-emerald-400" /> World Manager
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Browse, upload, configure, and manage this server's worlds.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 p-1 bg-black/40 border border-border rounded-xl w-fit">
          <button
            onClick={() => setTab("browse")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "browse" ? "bg-theme-500 text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Search size={16} /> Browse Worlds
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "manage" ? "bg-theme-500 text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Settings2 size={16} /> Manage
          </button>
        </div>

        {tab === "browse" ? (
          <div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-6">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchCurseForge(query)}
                  placeholder="Search worlds on CurseForge..."
                  className="w-full bg-black/40 border border-border focus:border-theme-500 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-foreground outline-none shadow-inner transition-colors"
                />
              </div>
              <button
                onClick={() => searchCurseForge(query)}
                className="shrink-0 px-5 py-3 bg-theme-500 hover:bg-theme-400 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Search
              </button>
            </div>

            {cfLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-theme-500 animate-spin" />
              </div>
            ) : cfError ? (
              <div className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-center">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                <p className="text-sm text-amber-300 font-medium">{cfError}</p>
              </div>
            ) : cfWorlds.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">
                No worlds found. Try a different search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cfWorlds.map((w) => (
                  <div key={w.id} className="bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 ring-1 ring-border-subtle flex flex-col">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                        {w.logo ? <img src={w.logo} alt="" className="w-full h-full object-cover" /> : <Globe2 className="w-6 h-6 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">{w.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{w.author}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 flex-1">{w.summary}</p>
                    <div className="flex items-center justify-between mt-4">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <Download size={12} /> {w.downloadCount.toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleInstallCf(w)}
                        disabled={installingId === w.id}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-theme-500 hover:bg-theme-400 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50"
                      >
                        {installingId === w.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {installingId === w.id ? "Installing..." : "Install"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Server Worlds */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Server Worlds</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">World folders detected on your server (contain a level.dat).</p>
                </div>
                <div>
                  <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-500 hover:bg-theme-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" /> {isUploading ? "Uploading..." : "Upload World"}
                  </button>
                </div>
              </div>

              {worlds.length === 0 ? (
                <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">
                  No worlds found yet. Start the server once to generate a default world, or upload one above.
                </div>
              ) : (
                <div className="space-y-3">
                  {worlds.map((world) => (
                    <div
                      key={world.name + world.bedrockStyle}
                      className={`bg-black/40 backdrop-blur-xl border rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ring-1 ${world.active ? "border-emerald-500/40 ring-emerald-500/20" : "border-border ring-border-subtle"}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${world.active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          <Globe2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground truncate">{world.name}</span>
                            {world.active && (
                              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                                <Star className="w-3 h-3" /> Active
                              </span>
                            )}
                            {world.worldVersion && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-theme-500/10 text-theme-400 border border-theme-500/30 shrink-0">
                                MC {world.worldVersion}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {world.worldName && world.worldName !== world.name ? `"${world.worldName}" · ` : ""}
                            Last modified {new Date(world.modifiedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {!world.active && (
                          <button
                            onClick={() => handleSwitch(world.name)}
                            disabled={busyWorld === world.name}
                            className="px-3 py-2 text-xs font-bold bg-theme-500/10 hover:bg-theme-500/20 text-theme-400 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => handleBackup(world)}
                          disabled={busyWorld === world.name}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-muted-foreground bg-muted border border-transparent hover:border-theme-500/30 hover:text-theme-400 hover:bg-theme-500/10 rounded-lg transition-all disabled:opacity-50"
                        >
                          <Archive size={14} /> Backup
                        </button>
                        <button onClick={() => handleDownload(world)} className="p-2 text-muted-foreground bg-muted border border-transparent hover:border-theme-500/30 hover:text-theme-400 hover:bg-theme-500/10 rounded-lg transition-all" title="Download world">
                          <Download size={16} />
                        </button>
                        <button onClick={() => handleDelete(world)} disabled={busyWorld === world.name} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* World Settings */}
            {propsExist && (
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">World Settings</h3>
                <p className="text-xs text-muted-foreground mb-3">Edit key server.properties values. Changes apply on next restart.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SettingCard icon={<Shield className="w-4 h-4 text-theme-400" />} title="Difficulty">
                    <PillGroup
                      value={props["difficulty"] || "normal"}
                      onChange={(v) => setPropAndSave("difficulty", v)}
                      options={[
                        { value: "peaceful", label: "Peaceful" },
                        { value: "easy", label: "Easy" },
                        { value: "normal", label: "Normal" },
                        { value: "hard", label: "Hard" },
                      ]}
                    />
                  </SettingCard>
                  <SettingCard icon={<Gamepad2 className="w-4 h-4 text-theme-400" />} title="Default Game Mode">
                    <PillGroup
                      value={props["gamemode"] || "survival"}
                      onChange={(v) => setPropAndSave("gamemode", v)}
                      options={[
                        { value: "survival", label: "Survival" },
                        { value: "creative", label: "Creative" },
                        { value: "adventure", label: "Adventure" },
                        { value: "spectator", label: "Spectator" },
                      ]}
                    />
                  </SettingCard>
                  <SettingCard icon={<Swords className="w-4 h-4 text-theme-400" />} title="PvP">
                    <PillGroup
                      value={props["pvp"] === "false" ? "false" : "true"}
                      onChange={(v) => setPropAndSave("pvp", v)}
                      options={[
                        { value: "true", label: "Enabled" },
                        { value: "false", label: "Disabled" },
                      ]}
                    />
                  </SettingCard>
                  <NumberSaveField
                    label="Spawn Protection"
                    hint="Radius around world spawn point"
                    value={props["spawn-protection"] ?? ""}
                    onChange={(v) => setProps((p) => ({ ...p, "spawn-protection": v }))}
                    onSave={() => savePropertyKey("spawn-protection")}
                    saving={savingKey === "spawn-protection"}
                  />
                  <NumberSaveField
                    label="View Distance"
                    hint="Chunks sent to players around them"
                    value={props["view-distance"] ?? ""}
                    onChange={(v) => setProps((p) => ({ ...p, "view-distance": v }))}
                    onSave={() => savePropertyKey("view-distance")}
                    saving={savingKey === "view-distance"}
                  />
                  <NumberSaveField
                    label="Level Seed"
                    hint="Used only when generating a brand-new world"
                    value={props["level-seed"] ?? ""}
                    placeholder="Leave blank for random"
                    onChange={(v) => setProps((p) => ({ ...p, "level-seed": v }))}
                    onSave={() => savePropertyKey("level-seed")}
                    saving={savingKey === "level-seed"}
                  />
                </div>
              </div>
            )}

            {/* Game Rules */}
            {!isBedrock && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-foreground">Game Rules</h3>
                  <button
                    onClick={saveRules}
                    disabled={savingRules}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-500 hover:bg-theme-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50"
                  >
                    {savingRules ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Rules
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Rules are written as a datapack and applied automatically on world load.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {GAME_RULES.map((rule) => (
                    <ToggleRow
                      key={rule.key}
                      label={rule.label}
                      hint={rule.hint}
                      checked={(rules[rule.key] ?? rule.default) === "true"}
                      onChange={(v) => setRules((r) => ({ ...r, [rule.key]: String(v) }))}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  {GAME_RULE_NUMBERS.map((rule) => (
                    <div key={rule.key} className="bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 ring-1 ring-border-subtle">
                      <p className="text-sm font-bold text-foreground">{rule.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 mb-2">{rule.hint}</p>
                      <input
                        type="number"
                        value={rules[rule.key] ?? rule.default}
                        onChange={(e) => setRules((r) => ({ ...r, [rule.key]: e.target.value }))}
                        className="w-full bg-black/60 border border-border focus:border-theme-500 rounded-xl px-3.5 py-2 text-sm font-medium text-foreground outline-none shadow-inner transition-colors"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-start gap-2 mt-4 p-4 bg-theme-500/5 border border-theme-500/20 rounded-2xl text-xs text-muted-foreground">
                  <Compass className="w-4 h-4 text-theme-400 shrink-0 mt-0.5" />
                  <span>
                    Rules are saved as a datapack in{" "}
                    <code className="text-theme-300">{rulesWorldName || "world"}/datapacks/world-manager-gamerules/</code>{" "}
                    and apply automatically on every server start. No in-game commands needed.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {isUploading && <LoadingOverlay message="Uploading and extracting world..." />}
    </div>
  );
}
