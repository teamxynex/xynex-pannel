import React, { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Download,
  X,
} from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import { useAuth } from "../context/AuthContext";

// Small "logo" treatment per software — a colored badge with a distinct
// letterform/icon so each entry reads as a recognizable brand chip without
// depending on external image assets.
const SOFTWARE_STYLES: Record<string, { label: string; classes: string }> = {
  PAPER: { label: "P", classes: "bg-gradient-to-br from-amber-500/30 to-amber-600/10 text-amber-400 border-amber-500/30" },
  SPIGOT: { label: "S", classes: "bg-gradient-to-br from-orange-500/30 to-orange-600/10 text-orange-400 border-orange-500/30" },
  VANILLA: { label: "V", classes: "bg-gradient-to-br from-emerald-500/30 to-emerald-600/10 text-emerald-400 border-emerald-500/30" },
  FORGE: { label: "F", classes: "bg-gradient-to-br from-red-500/30 to-red-600/10 text-red-400 border-red-500/30" },
  FABRIC: { label: "Fb", classes: "bg-gradient-to-br from-cyan-500/30 to-cyan-600/10 text-cyan-400 border-cyan-500/30" },
  VELOCITY: { label: "Ve", classes: "bg-gradient-to-br from-blue-500/30 to-blue-600/10 text-blue-400 border-blue-500/30" },
  BUNGEECORD: { label: "B", classes: "bg-gradient-to-br from-yellow-500/30 to-yellow-600/10 text-yellow-400 border-yellow-500/30" },
  WATERFALL: { label: "W", classes: "bg-gradient-to-br from-sky-500/30 to-sky-600/10 text-sky-400 border-sky-500/30" },
};

function getSoftwareStyle(name: string) {
  const key = (name || "").toUpperCase();
  return SOFTWARE_STYLES[key] || { label: name?.[0]?.toUpperCase() || "?", classes: "bg-gradient-to-br from-theme-500/30 to-theme-600/10 text-theme-400 border-theme-500/30" };
}

export default function ServerVersions({ serverId, server }: { serverId: string; server: any }) {
  const { user } = useAuth();
  const [eggs, setEggs] = useState<any[]>([]);
  const [expandedEggId, setExpandedEggId] = useState<string | null>(null);
  const [loadingEggs, setLoadingEggs] = useState(true);

  const [popupEgg, setPopupEgg] = useState<any>(null);
  const [popupVersion, setPopupVersion] = useState<string>("");
  const [wipeData, setWipeData] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.role === "admin" || user?.role === "owner" || server?.owner === user?.id;

  useEffect(() => {
    axios
      .get("/api/eggs")
      .then((res) => {
        setEggs(res.data || []);
      })
      .catch(() => {})
      .finally(() => setLoadingEggs(false));
  }, []);

  // Group every software option by its category (Minecraft, Proxy, ...)
  // so all of them are visible here, not just the ones matching this
  // server's current category.
  const eggsByCategory = eggs.reduce((acc: Record<string, any[]>, egg: any) => {
    const cat = egg.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(egg);
    return acc;
  }, {});
  const categoryOrder = Object.keys(eggsByCategory).sort((a, b) => {
    // Keep Minecraft first, then Proxy, then anything else alphabetically.
    const rank = (c: string) => (c === "Minecraft" ? 0 : c === "Proxy" ? 1 : 2);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });

  const isCurrentlyInstalled = (egg: any, version: string) => {
    const sameSoftware = server?.eggId ? server.eggId === egg.id : (server?.type || "").toUpperCase() === (egg.name || "").toUpperCase();
    return sameSoftware && server?.version === version;
  };

  const openInstallPopup = (egg: any, version: string) => {
    if (!canManage) return;
    setPopupEgg(egg);
    setPopupVersion(version);
    setWipeData(false);
    setError(null);
  };

  const closePopup = () => {
    if (isInstalling) return;
    setPopupEgg(null);
    setPopupVersion("");
    setWipeData(false);
    setError(null);
  };

  const handleInstall = async () => {
    if (!popupEgg || !popupVersion) return;
    setIsInstalling(true);
    setInstallProgress(0);
    setError(null);

    const interval = setInterval(() => {
      setInstallProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + (Math.random() * 8 + 2);
      });
    }, 300);

    try {
      await axios.put(`/api/servers/${serverId}/version`, {
        version: popupVersion,
        type: popupEgg.name,
        eggId: popupEgg.id,
        wipeData,
      });
      clearInterval(interval);
      setInstallProgress(100);
      setTimeout(() => {
        setIsInstalling(false);
        setInstallProgress(0);
        setPopupEgg(null);
        setPopupVersion("");
        setWipeData(false);
      }, 600);
    } catch (e: any) {
      clearInterval(interval);
      setInstallProgress(0);
      setIsInstalling(false);
      setError(e.response?.data?.error || "Failed to install this version. Make sure the server is stopped first.");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-theme-400" /> Versions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick server software and a version to install. Currently running{" "}
            <span className="font-semibold text-foreground-muted">{server?.type || "—"}</span>{" "}
            <span className="font-mono text-foreground-muted">{server?.version || ""}</span>.
          </p>
        </div>

        {!canManage && (
          <div className="mb-6 text-sm text-muted-foreground p-4 bg-muted rounded-xl border border-border-subtle">
            You do not have permission to change this server's version.
          </div>
        )}

        {loadingEggs ? (
          <div className="flex items-center justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 border-2 border-theme-500 border-t-transparent rounded-full"
            />
          </div>
        ) : eggs.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 bg-muted rounded-xl border border-border-subtle">
            No server software is available yet.
          </div>
        ) : (
          <div className="space-y-8">
            {categoryOrder.map((cat) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-muted-foreground mb-3 tracking-wider uppercase">{cat}</div>
                <div className="space-y-3">
                  {eggsByCategory[cat].map((egg: any) => {
                    const style = getSoftwareStyle(egg.name);
                    const isOpen = expandedEggId === egg.id;
                    const isActiveSoftware = server?.eggId ? server.eggId === egg.id : (server?.type || "").toUpperCase() === (egg.name || "").toUpperCase();
                    return (
                <div
                  key={egg.id}
                  className={`bg-black/40 dark:bg-black/40 backdrop-blur-xl border rounded-2xl shadow-[0_0_30px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle overflow-hidden transition-colors ${
                    isOpen ? "border-theme-500/40" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedEggId(isOpen ? null : egg.id)}
                    className="w-full flex items-center gap-4 p-4 md:p-5 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <div className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center font-extrabold text-lg ${style.classes}`}>
                      {style.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{egg.name}</span>
                        {isActiveSoftware && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Installed
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{egg.dockerImage}</div>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 md:px-5 pb-5 pt-1 border-t border-border-subtle">
                          {(!egg.versions || egg.versions.length === 0) ? (
                            <p className="text-sm text-muted-foreground pt-3">This software has no selectable versions.</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-3">
                              {egg.versions.map((v: string) => {
                                const installed = isCurrentlyInstalled(egg, v);
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    disabled={!canManage}
                                    onClick={() => openInstallPopup(egg, v)}
                                    className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-mono font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                      installed
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                        : "bg-muted-subtle border-border-subtle text-foreground-muted hover:border-theme-500/40 hover:bg-theme-500/10 hover:text-theme-300"
                                    }`}
                                  >
                                    {installed && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                                    {v}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {popupEgg && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#121214] border border-border shadow-2xl rounded-3xl p-6 md:p-8 max-w-md w-full relative overflow-hidden ring-1 ring-border-subtle"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-theme-500 to-cyan-400" />

              <button
                onClick={closePopup}
                disabled={isInstalling}
                className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted-hover rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-1">
                <div className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center font-extrabold ${getSoftwareStyle(popupEgg.name).classes}`}>
                  {getSoftwareStyle(popupEgg.name).label}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{popupEgg.name}</div>
                  <h3 className="text-2xl font-mono font-extrabold text-foreground leading-tight">{popupVersion}</h3>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mt-4 mb-5 leading-relaxed">
                This will stop-swap the server's software/version. The server must be stopped first.
              </p>

              <div
                className={`p-4 rounded-2xl border flex items-start justify-between gap-4 ${
                  wipeData ? "bg-red-500/10 border-red-500/30" : "bg-muted-subtle border-border-subtle"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Trash2 className={`w-5 h-5 mt-0.5 shrink-0 ${wipeData ? "text-red-400" : "text-muted-foreground"}`} />
                  <div>
                    <div className={`text-sm font-bold ${wipeData ? "text-red-400" : "text-foreground-muted"}`}>Wipe Server Data</div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {wipeData
                        ? "All world, plugin, and config data will be permanently deleted before this version installs."
                        : "Off: your world and data will be kept. On: everything is deleted before installing."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWipeData((w) => !w)}
                  disabled={isInstalling}
                  className={`shrink-0 w-11 h-6 rounded-full relative transition-colors disabled:opacity-50 ${
                    wipeData ? "bg-red-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      wipeData ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start text-red-400">
                  <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium">{error}</p>
                </div>
              )}

              {isInstalling && (
                <div className="mt-4 p-4 border border-zinc-800 bg-muted rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-theme-400">Installing {popupVersion}...</span>
                    <span className="text-sm font-mono text-theme-400/80">{Math.round(installProgress)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800/50 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-theme-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${installProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closePopup}
                  disabled={isInstalling}
                  className="px-4 py-2.5 bg-muted hover:bg-muted-hover text-foreground font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="px-5 py-2.5 bg-theme-500 hover:bg-theme-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {isInstalling ? "Installing..." : "Install"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isInstalling && <LoadingOverlay message={`Installing ${popupVersion}...`} />}
    </div>
  );
}
