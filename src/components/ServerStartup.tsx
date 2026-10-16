import React, { useEffect, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { TerminalSquare, Save, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import { useAuth } from "../context/AuthContext";

interface StartupVariable {
  name: string;
  envVariable: string;
  description: string;
  defaultValue: string;
  editable: boolean;
  value: string;
}

export default function ServerStartup({ serverId, server }: { serverId: string; server: any }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [eggName, setEggName] = useState("");
  const [startup, setStartup] = useState("");
  const [variables, setVariables] = useState<StartupVariable[]>([]);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "owner" || server?.owner === user?.id;

  const load = () => {
    setLoading(true);
    axios
      .get(`/api/servers/${serverId}/startup`)
      .then((res) => {
        setEggName(res.data.eggName || "");
        setStartup(res.data.startup || "");
        setVariables(res.data.variables || []);
        setEdited({});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const currentValue = (v: StartupVariable) => (edited[v.envVariable] !== undefined ? edited[v.envVariable] : v.value);

  // Live preview of the startup command using whatever is currently typed
  // in the editable fields, so it updates as the user types.
  const renderedStartup = startup.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) => {
    const v = variables.find((vv) => vv.envVariable === key);
    return v ? currentValue(v) : "";
  });

  const hasChanges = Object.keys(edited).length > 0;

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await axios.put(`/api/servers/${serverId}/startup`, { variables: edited });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to save startup variables.");
    } finally {
      setSaving(false);
    }
  };

  const [installLog, setInstallLog] = useState<string | null>(null);
  const [showInstallLog, setShowInstallLog] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  const loadInstallLog = () => {
    setLoadingLog(true);
    axios
      .get(`/api/servers/${serverId}/install-logs`)
      .then((res) => setInstallLog(res.data.log || ""))
      .catch(() => setInstallLog(""))
      .finally(() => setLoadingLog(false));
  };

  const toggleInstallLog = () => {
    const next = !showInstallLog;
    setShowInstallLog(next);
    if (next && installLog === null) loadInstallLog();
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
        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <TerminalSquare className="w-6 h-6 text-theme-400" /> Startup
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            The startup command and variables provided by{" "}
            <span className="font-semibold text-foreground-muted">{eggName || server?.type || "this egg"}</span>.
          </p>
        </div>

        {!canManage && (
          <div className="mb-6 text-sm text-muted-foreground p-4 bg-muted rounded-xl border border-border-subtle">
            You do not have permission to change this server's startup variables.
          </div>
        )}

        {!startup ? (
          <div className="text-sm text-muted-foreground p-4 bg-muted rounded-xl border border-border-subtle">
            This server's egg does not define a startup command.
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="text-xs font-semibold text-muted-foreground mb-2 tracking-wider uppercase">Startup Command</div>
              <div className="bg-black/60 border border-border-subtle rounded-2xl p-4 font-mono text-sm text-emerald-300 whitespace-pre-wrap break-all">
                {renderedStartup}
              </div>
            </div>

            <div className="text-xs font-semibold text-muted-foreground mb-3 tracking-wider uppercase">Variables</div>
            <div className="space-y-3">
              {variables.map((v) => (
                <div
                  key={v.envVariable}
                  className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 md:p-5 ring-1 ring-border-subtle"
                >
                  <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-foreground truncate">{v.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-theme-500/10 text-theme-300 border border-theme-500/30 shrink-0">
                        {v.envVariable}
                      </span>
                      {!v.editable && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                          <Lock className="w-3 h-3" /> Read-only
                        </span>
                      )}
                    </div>
                  </div>
                  {v.description && (
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{v.description}</p>
                  )}
                  <input
                    type="text"
                    value={currentValue(v)}
                    disabled={!canManage || !v.editable}
                    onChange={(e) => setEdited((prev) => ({ ...prev, [v.envVariable]: e.target.value }))}
                    className="w-full px-3 py-2 bg-muted-subtle border border-border-subtle rounded-xl text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start text-red-400">
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}

            {canManage && (
              <div className="flex items-center justify-end gap-3 mt-6">
                {saved && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Saved — applies on next reinstall/recreate
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="px-5 py-2.5 bg-theme-500 hover:bg-theme-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="max-w-4xl mx-auto mt-6">
        <button
          type="button"
          onClick={toggleInstallLog}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
        >
          {showInstallLog ? "Hide installation log" : "Show installation log"}
        </button>
        {showInstallLog && (
          <div className="mt-3 bg-black/60 border border-border-subtle rounded-2xl p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap max-h-80 overflow-y-auto custom-scrollbar">
            {loadingLog ? "Loading..." : (installLog || "No installation log yet — this egg either hasn't been (re)installed, or has no installation script.")}
          </div>
        )}
      </div>

      {saving && <LoadingOverlay message="Saving startup variables..." />}
    </div>
  );
}
