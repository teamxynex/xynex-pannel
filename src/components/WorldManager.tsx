import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Globe2, Upload, Download, Trash2, CheckCircle2, AlertTriangle, Star } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

interface World {
  name: string;
  bedrockStyle: boolean;
  active: boolean;
  modifiedAt: string;
  worldName?: string;
  worldVersion?: string;
  dataVersion?: number;
}

export default function WorldManager({ serverId, server }: { serverId: string; server: any }) {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [busyWorld, setBusyWorld] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBedrock = (server?.type || "").toUpperCase() === "BEDROCK";

  const load = () => {
    setLoading(true);
    axios
      .get(`/api/servers/${serverId}/worlds`)
      .then((res) => setWorlds(res.data.worlds || []))
      .catch(() => setMsg({ text: "Failed to load worlds.", type: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [serverId]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("worldName", file.name.replace(/\.zip$/i, ""));
      formData.append("bedrockStyle", String(isBedrock));
      await axios.post(`/api/servers/${serverId}/worlds/upload`, formData);
      setMsg({ text: "World uploaded.", type: "success" });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to upload world.", type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSwitch = async (worldName: string) => {
    setBusyWorld(worldName);
    setMsg(null);
    try {
      await axios.put(`/api/servers/${serverId}/worlds/active`, { worldName });
      setMsg({ text: `Active world set to "${worldName}". Restart the server to load it.`, type: "success" });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to switch world.", type: "error" });
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
    }).catch(() => setMsg({ text: "Failed to download world.", type: "error" }));
  };

  const handleDelete = async (world: World) => {
    if (!confirm(`Delete world "${world.name}"? This cannot be undone.`)) return;
    setBusyWorld(world.name);
    try {
      await axios.delete(`/api/servers/${serverId}/worlds`, { data: { worldName: world.name, bedrockStyle: world.bedrockStyle } });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to delete world.", type: "error" });
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
            <p className="text-sm text-muted-foreground mt-1">Upload, switch, download, or delete this server's worlds.</p>
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-theme-500 hover:bg-theme-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              <Upload className="w-4 h-4" /> {isUploading ? "Uploading..." : "Upload World (.zip)"}
            </button>
          </div>
        </div>

        {msg && (
          <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${msg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
            {msg.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{msg.text}</span>
          </div>
        )}

        {worlds.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">
            No worlds found yet. Start the server once to generate a default world, or upload one above.
          </div>
        ) : (
          <div className="space-y-3">
            {worlds.map((world) => (
              <div
                key={world.name + world.bedrockStyle}
                className={`bg-black/40 dark:bg-black/40 backdrop-blur-xl border rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4 ring-1 ${world.active ? "border-emerald-500/40 ring-emerald-500/20" : "border-border ring-border-subtle"}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${world.active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                    <Globe2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground truncate">{world.name}</span>
                      {world.active && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                          <Star className="w-3 h-3" /> Active
                        </span>
                      )}
                      {world.worldVersion && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-theme-500/10 text-theme-400 border border-theme-500/30 shrink-0" title={world.dataVersion ? `Data version ${world.dataVersion}` : undefined}>
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
                <div className="flex items-center gap-2 shrink-0">
                  {!world.active && (
                    <button
                      onClick={() => handleSwitch(world.name)}
                      disabled={busyWorld === world.name}
                      className="px-3 py-2 text-xs font-bold bg-theme-500/10 hover:bg-theme-500/20 text-theme-400 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Set Active
                    </button>
                  )}
                  <button onClick={() => handleDownload(world)} className="p-2 text-muted-foreground bg-muted border border-transparent hover:border-theme-500/30 hover:text-theme-400 hover:bg-theme-500/10 rounded-lg transition-all" title="Download world">
                    <Download size={16} />
                  </button>
                  <button onClick={() => handleDelete(world)} disabled={busyWorld === world.name} className="p-2 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50" title="Delete world">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isUploading && <LoadingOverlay message="Uploading and extracting world..." />}
    </div>
  );
}
