import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Boxes, Upload, Trash2, CheckCircle2, AlertTriangle, Github, Zap } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

interface Resource { name: string; enabled: boolean; }

export default function FiveMResources({ serverId }: { serverId: string }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [busyResource, setBusyResource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    axios.get(`/api/servers/${serverId}/resources`)
      .then((res) => setResources(res.data.resources || []))
      .catch(() => setMsg({ text: "Failed to load resources.", type: "error" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [serverId]);

  const handleUpload = async (file: File) => {
    setIsInstalling(true);
    setMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("resourceName", file.name.replace(/\.zip$/i, ""));
      const res = await axios.post(`/api/servers/${serverId}/resources/upload`, formData);
      setMsg({ text: `Installed "${res.data.resourceName}" and added it to server.cfg.`, type: "success" });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to install resource.", type: "error" });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleGitInstall = async () => {
    if (!gitUrl.trim()) return;
    setIsInstalling(true);
    setMsg(null);
    try {
      const res = await axios.post(`/api/servers/${serverId}/resources/git`, { gitUrl: gitUrl.trim() });
      setMsg({ text: `Installed "${res.data.resourceName}" from GitHub.`, type: "success" });
      setGitUrl("");
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to install from GitHub.", type: "error" });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleFramework = async (framework: "esx" | "qbcore") => {
    if (!confirm(`Install the ${framework === "esx" ? "ESX" : "QBCore"} base framework? This adds it as a resource and enables it.`)) return;
    setIsInstalling(true);
    setMsg(null);
    try {
      const res = await axios.post(`/api/servers/${serverId}/resources/framework`, { framework });
      setMsg({ text: `Installed framework "${res.data.resourceName}".`, type: "success" });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to install framework.", type: "error" });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleToggle = async (resource: Resource) => {
    setBusyResource(resource.name);
    try {
      await axios.put(`/api/servers/${serverId}/resources/toggle`, { name: resource.name, enabled: !resource.enabled });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to toggle resource.", type: "error" });
    } finally {
      setBusyResource(null);
    }
  };

  const handleDelete = async (resource: Resource) => {
    if (!confirm(`Delete resource "${resource.name}"? This cannot be undone.`)) return;
    setBusyResource(resource.name);
    try {
      await axios.delete(`/api/servers/${serverId}/resources`, { data: { name: resource.name } });
      load();
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to delete resource.", type: "error" });
    } finally {
      setBusyResource(null);
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
        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Boxes className="w-6 h-6 text-amber-400" /> Resource Manager
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Install resources/scripts from a .zip or a GitHub repo — they're added to server.cfg automatically.</p>
        </div>

        {msg && (
          <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 text-sm font-medium ${msg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
            {msg.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 md:p-5 ring-1 ring-border-subtle mb-6">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Github className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                type="text"
                placeholder="https://github.com/user/resource-name"
                className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground transition-all shadow-inner outline-none"
              />
            </div>
            <button onClick={handleGitInstall} disabled={isInstalling || !gitUrl.trim()} className="px-5 py-2.5 bg-theme-500 hover:bg-theme-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 whitespace-nowrap">
              Install from GitHub
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isInstalling} className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted-subtle text-foreground text-sm font-semibold rounded-xl transition-all disabled:opacity-50">
              <Upload size={15} /> Upload .zip
            </button>
            <div className="h-5 w-px bg-border-subtle" />
            <span className="text-xs text-muted-foreground">Quick install framework:</span>
            <button onClick={() => handleFramework("esx")} disabled={isInstalling} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg transition-all disabled:opacity-50">
              <Zap size={13} /> ESX
            </button>
            <button onClick={() => handleFramework("qbcore")} disabled={isInstalling} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-bold rounded-lg transition-all disabled:opacity-50">
              <Zap size={13} /> QBCore
            </button>
          </div>
        </div>

        {resources.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">
            No resources installed yet.
          </div>
        ) : (
          <div className="space-y-3">
            {resources.map((r) => (
              <div key={r.name} className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 flex items-center justify-between gap-4 ring-1 ring-border-subtle">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                    <Boxes className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-foreground truncate">{r.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={r.enabled} onChange={() => handleToggle(r)} disabled={busyResource === r.name} className="sr-only peer" />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                  <button onClick={() => handleDelete(r)} disabled={busyResource === r.name} className="p-2 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50" title="Delete resource">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isInstalling && <LoadingOverlay message="Installing resource..." />}
    </div>
  );
}
