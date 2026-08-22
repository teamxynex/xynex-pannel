import React, { useEffect, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { PackageSearch, Search, Download, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

interface ModpackResult { id: string; slug: string; title: string; description: string; iconUrl: string; downloads: number; author: string; }
interface ModpackVersion { id: string; name: string; versionNumber: string; gameVersions: string[]; loaders: string[]; datePublished: string; }

export default function Modpacks({ serverId }: { serverId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModpackResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<ModpackResult | null>(null);
  const [versions, setVersions] = useState<ModpackVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const search = (q: string) => {
    setIsSearching(true);
    axios.get(`/api/servers/${serverId}/modpacks/search`, { params: { query: q } })
      .then((res) => setResults(res.data.results || []))
      .catch(() => setResults([]))
      .finally(() => setIsSearching(false));
  };

  useEffect(() => { search(""); }, [serverId]);

  const openModpack = (pack: ModpackResult) => {
    setSelected(pack);
    setLoadingVersions(true);
    axios.get(`/api/servers/${serverId}/modpacks/${pack.id}/versions`)
      .then((res) => setVersions(res.data.versions || []))
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  };

  const handleInstall = async (version: ModpackVersion) => {
    if (!confirm(`Install "${selected?.title}" (${version.versionNumber})? This will download mod files into this server and may overwrite existing configs.`)) return;
    setInstallingVersionId(version.id);
    setMsg(null);
    try {
      const res = await axios.post(`/api/servers/${serverId}/modpacks/install`, { versionId: version.id });
      setMsg({ text: `Installed ${res.data.installedFiles} mod file(s). Make sure the server's loader/Minecraft version (${version.loaders?.join(", ")} ${version.gameVersions?.[version.gameVersions.length - 1]}) matches under the Versions tab, then restart.`, type: "success" });
    } catch (e: any) {
      setMsg({ text: e.response?.data?.error || "Failed to install modpack.", type: "error" });
    } finally {
      setInstallingVersionId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <PackageSearch className="w-6 h-6 text-orange-400" /> Modpacks
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Browse and install modpacks from Modrinth directly into this server.</p>
        </div>

        {msg && (
          <div className={`p-4 rounded-xl mb-6 flex items-start gap-3 text-sm font-medium ${msg.type === "success" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
            {msg.type === "success" ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
            <span>{msg.text}</span>
          </div>
        )}

        {!selected ? (
          <>
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search(query)}
                type="text"
                placeholder="Search modpacks (e.g. All the Mods, RLCraft, Skyfactory)..."
                className="w-full bg-muted border border-border focus:border-theme-500 focus:ring-1 focus:ring-theme-500/50 rounded-xl pl-11 pr-24 py-3 text-foreground transition-all shadow-inner outline-none"
              />
              <button
                onClick={() => search(query)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-theme-500 hover:bg-theme-400 text-white text-xs font-bold rounded-lg transition-all"
              >
                Search
              </button>
            </div>

            {isSearching ? (
              <div className="flex items-center justify-center py-16">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-theme-500 border-t-transparent rounded-full" />
              </div>
            ) : results.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">No modpacks found.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {results.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => openModpack(pack)}
                    className="text-left bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 ring-1 ring-border-subtle hover:border-theme-500/40 hover:ring-theme-500/20 transition-all flex gap-3"
                  >
                    {pack.iconUrl ? (
                      <img src={pack.iconUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 bg-muted" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center shrink-0"><PackageSearch className="w-6 h-6 text-muted-foreground" /></div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">{pack.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pack.description}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">by {pack.author} · {pack.downloads?.toLocaleString()} downloads</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <button onClick={() => { setSelected(null); setVersions([]); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft size={16} /> Back to search
            </button>
            <div className="flex items-center gap-4 mb-6">
              {selected.iconUrl && <img src={selected.iconUrl} alt="" className="w-16 h-16 rounded-2xl object-cover" />}
              <div>
                <h3 className="text-lg font-bold text-foreground">{selected.title}</h3>
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              </div>
            </div>

            {loadingVersions ? (
              <div className="flex items-center justify-center py-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-2 border-theme-500 border-t-transparent rounded-full" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 bg-muted rounded-2xl border border-border-subtle text-center">No installable versions found for this modpack.</div>
            ) : (
              <div className="space-y-3">
                {versions.map((v) => (
                  <div key={v.id} className="bg-black/40 dark:bg-black/40 backdrop-blur-xl border border-border rounded-2xl p-4 flex items-center justify-between gap-4 ring-1 ring-border-subtle">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{v.name || v.versionNumber}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        MC {v.gameVersions?.join(", ")} · {v.loaders?.join(", ")} · {new Date(v.datePublished).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleInstall(v)}
                      disabled={installingVersionId === v.id}
                      className="flex items-center gap-2 px-4 py-2 bg-theme-500 hover:bg-theme-400 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 shrink-0"
                    >
                      <Download size={15} /> {installingVersionId === v.id ? "Installing..." : "Install"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {installingVersionId && <LoadingOverlay message="Downloading modpack files — this can take a few minutes..." />}
    </div>
  );
}
