import React, { useEffect, useState } from "react";
import axios from "axios";
import { Network as NetworkIcon, Wifi, WifiOff, Copy, Check, Server as ServerIcon } from "lucide-react";

interface NetworkInfo {
  ip: string | null;
  port: number;
  ipAlias: string | null;
  node: { id: string | null; name: string; fqdn: string | null; status: string };
}

export default function ServerNetwork({ serverId }: { serverId: string }) {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    axios.get(`/api/servers/${serverId}/network`)
      .then(res => setInfo(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  const address = info ? `${info.ip || "—"}:${info.port}` : "";

  const handleCopy = () => {
    if (!info) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 text-foreground">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <div>
          <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground-muted mb-1">Network</h2>
          <p className="text-sm text-muted-foreground">The address players/clients use to connect, and which node this server runs on.</p>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-theme-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !info ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Could not load network info.</div>
        ) : (
          <>
            <div className="bg-muted-subtle border border-border-subtle p-5 md:p-6 rounded-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-theme-500/10 text-theme-400 rounded-lg shrink-0">
                  <NetworkIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-0.5">Primary Allocation</h3>
                  <p className="font-mono text-sm text-muted-foreground">{address}</p>
                </div>
              </div>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-muted hover:bg-muted-hover text-foreground text-xs font-medium rounded transition-colors flex items-center gap-1.5 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="bg-muted-subtle border border-border-subtle rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border-subtle flex items-center gap-2">
                <ServerIcon className="w-4 h-4 text-theme-400" />
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Node</h3>
              </div>
              <div className="p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{info.node.name}</p>
                  {info.node.fqdn && <p className="font-mono text-xs text-muted-foreground mt-1">{info.node.fqdn}</p>}
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${info.node.status === "connected" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30"}`}>
                  {info.node.status === "connected" ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {info.node.status === "connected" ? "Connected" : "Not Connected"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
