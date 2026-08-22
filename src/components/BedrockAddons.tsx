import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Puzzle, Upload, Trash2, CheckCircle2, AlertTriangle, Sparkles, Palette } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

interface World { name: string; active: boolean; bedrockStyle: boolean; }
interface Addon { folder: string; kind: "behavior" | "resource"; name: string; description: string; version: string; packId: string; }

export default function BedrockAddons({ serverId }: { serverId: string }) {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<string>("");
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadWorlds = async () => {
    try {
      const res = await axios.get(`/api/servers/${serverId}/worlds`);
      const list: World[] = res.data.worlds || [];
      setWorlds(list);
      const active = list.find((w) => w.active) || list[0];
      if (active) setSelectedWorld(active.name);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadAddons = (worldName: string) => {
    if (!worldName) { setAddons([]); return; }
    axios.get(`/api/servers/${serverId}/addons`, { params: { worldName } })
      .then((res) => setAddons(res.data.addons || []))
      .catch(() => setAddons([]));
  };

  useEffect(() => { loadWorlds(); }, [serverId]);
  useEffect(() => { if (selectedWorld) loadAddons(selectedWorld); }, [selectedWorld]);

  const handleUpload = async (file: File) => {
    if (!selectedWorld) return;
    setIsUploading(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("worldName", selectedWorld);
      const res = await axios.post(`/api/servers/${serverId}/addons/upload`, formData);
      const names = (res.data.installed || []).map((i: any) => i.name).join(", ");
      setMsg({ text: `Installed: ${names}`, type: "success" });
      loadAddons(selectedWorld);
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to install addon.", type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (addon: Addon) => {
    if (!confirm(`Remove "${addon.name}" from this world?`)) return;
    try {
      await axios.delete(`/api/servers/${serverId}/addons`, { data: { worldName: selectedWorld, folder: addon.folder, kind: addon.kind, packId: addon.packId } });
      loadAddons(selectedWorld);
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to remove addon.", type: "error" });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-theme-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Puzzle className="w-6 h-6 text-purple-400" /> Bedrock Addons
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Install .mcpack / .mcaddon behavior and resource packs into a world.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedWorld}
              onChange={(e) => setSelectedWorld(e.target.value)}
              className="bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/40"
            >
              {worlds.length === 0 && <option value="">No worlds found</option>}
              {worlds.map((w) => (
                <option key={w.name} value={w.name}>{w.name}{w.active ? " (active)" : ""}</option>
              ))}
            </select>
            <input ref={fileInputRef} type="file" accept=".mcpack,.mcaddon" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !selectedWorld}
              className="flex items-center gap-2 px-5 py-2.5 bg-theme-500 hover:bg-theme-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
            >
              <Upload className="w-4 h-4" /> {isUploading ? "Installing..." : "Install Addon"}
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${msg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
            {msg.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{msg.text}</span>
          </div>
        )}

        {!selectedWorld ? (
          <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">
            Start the server once to generate a world, then come back here to install addons.
          </div>
        ) : addons.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">
            No addons installed on "{selectedWorld}" yet.
          </div>
        ) : (
          <div className="space-y-3">
            {addons.map((addon) => (
              <div key={addon.folder + addon.kind} className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4 ring-1 ring-border-subtle">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${addon.kind === "behavior" ? "bg-purple-500/15 text-purple-400" : "bg-pink-500/15 text-pink-400"}`}>
                    {addon.kind === "behavior" ? <Sparkles className="w-5 h-5" /> : <Palette className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground truncate">{addon.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border-subtle shrink-0 capitalize">{addon.kind} pack</span>
                    </div>
                    {addon.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{addon.description}</p>}
                    <p className="text-xs text-muted-foreground/70 mt-0.5">v{addon.version}</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(addon)} className="p-2 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0" title="Remove addon">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {isUploading && <LoadingOverlay message="Installing addon..." />}
    </div>
  );
}
