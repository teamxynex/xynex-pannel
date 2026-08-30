import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Terminal, Send, Download, CheckCircle2, AlertCircle } from "lucide-react";
import PluginManager from "./PluginManager";

type Section =
  | { title: string; type: "rcon_output"; command: string; refreshSeconds?: number }
  | { title: string; type: "rcon_buttons"; buttons: { label: string; commandTemplate: string; inputPlaceholder?: string }[] }
  | { title: string; type: "download_install"; targetDir?: string; items: { name: string; url?: string; modrinthProject?: string }[] }
  | { title: string; type: "votifier_test" }
  | { title: string; type: "plugin_search" };

type Extension = {
  id: string;
  name: string;
  description?: string;
  sections: Section[];
};

function RconOutputSection({ serverId, section }: { serverId: string; section: Extract<Section, { type: "rcon_output" }> }) {
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const fetchOutput = async () => {
      try {
        const res = await axios.post(`/api/servers/${serverId}/rcon`, { command: section.command });
        if (!cancelled) { setOutput(res.data.output || ""); setError(""); }
      } catch (e: any) {
        if (!cancelled) setError(e.response?.data?.error || "Failed to run command");
      }
    };
    fetchOutput();
    const interval = setInterval(fetchOutput, (section.refreshSeconds || 10) * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [serverId, section.command, section.refreshSeconds]);

  return (
    <div className="bg-muted-subtle border border-border-subtle rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-2 flex items-center"><Terminal className="w-4 h-4 mr-2 text-theme-400" /> {section.title}</h3>
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : (
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{output || "..."}</pre>
      )}
    </div>
  );
}

function RconButtonsSection({ serverId, section }: { serverId: string; section: Extract<Section, { type: "rcon_buttons" }> }) {
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<Record<number, "sending" | "sent" | "error">>({});

  const send = async (idx: number, template: string) => {
    const value = inputs[idx] || "";
    const command = template.replace("{input}", value);
    setStatus((s) => ({ ...s, [idx]: "sending" }));
    try {
      await axios.post(`/api/servers/${serverId}/command`, { command });
      setStatus((s) => ({ ...s, [idx]: "sent" }));
    } catch {
      setStatus((s) => ({ ...s, [idx]: "error" }));
    } finally {
      setTimeout(() => setStatus((s) => ({ ...s, [idx]: undefined as any })), 1500);
    }
  };

  return (
    <div className="bg-muted-subtle border border-border-subtle rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{section.title}</h3>
      <div className="flex flex-col gap-2">
        {section.buttons.map((btn, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {btn.commandTemplate.includes("{input}") && (
              <input
                type="text"
                placeholder={btn.inputPlaceholder || "value"}
                value={inputs[idx] || ""}
                onChange={(e) => setInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-theme-500"
              />
            )}
            <button
              onClick={() => send(idx, btn.commandTemplate)}
              className="px-3 py-1.5 bg-theme-500/15 hover:bg-theme-500/25 text-theme-300 border border-theme-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              {status[idx] === "sending" ? <div className="w-3 h-3 border-2 border-theme-300/50 border-t-theme-300 rounded-full animate-spin" /> : <Send size={12} />}
              {btn.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DownloadInstallSection({ serverId, section }: { serverId: string; section: Extract<Section, { type: "download_install" }> }) {
  const [status, setStatus] = useState<Record<number, "installing" | "done" | "error">>({});
  const [errorMsg, setErrorMsg] = useState<Record<number, string>>({});

  const install = async (idx: number, item: { name: string; url?: string; modrinthProject?: string }) => {
    setStatus((s) => ({ ...s, [idx]: "installing" }));
    try {
      const filename = item.url ? (item.url.split("/").pop() || `${item.name.replace(/[^a-zA-Z0-9]/g, "_")}.jar`) : undefined;
      await axios.post(`/api/servers/${serverId}/install-item`, {
        url: item.url,
        modrinthProject: item.modrinthProject,
        targetDir: section.targetDir || "plugins",
        filename,
      });
      setStatus((s) => ({ ...s, [idx]: "done" }));
    } catch (e: any) {
      setStatus((s) => ({ ...s, [idx]: "error" }));
      setErrorMsg((s) => ({ ...s, [idx]: e.response?.data?.error || "Install failed" }));
    }
  };

  return (
    <div className="bg-muted-subtle border border-border-subtle rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{section.title}</h3>
      <div className="flex flex-col gap-2">
        {section.items.map((item, idx) => (
          <div key={idx} className="p-2.5 bg-muted rounded-lg border border-border-subtle">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted truncate mr-3">{item.name}</span>
              <button
                onClick={() => install(idx, item)}
                disabled={status[idx] === "installing"}
                className="px-3 py-1.5 bg-white text-zinc-900 hover:bg-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {status[idx] === "installing" && <div className="w-3 h-3 border-2 border-zinc-900/40 border-t-zinc-900 rounded-full animate-spin" />}
                {status[idx] === "done" && <CheckCircle2 size={12} />}
                {status[idx] === "error" && <AlertCircle size={12} />}
                {!status[idx] && <Download size={12} />}
                {status[idx] === "done" ? "Installed" : status[idx] === "error" ? "Failed" : "Install"}
              </button>
            </div>
            {status[idx] === "error" && errorMsg[idx] && (
              <p className="text-[11px] text-red-400 mt-1.5">{errorMsg[idx]}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Restart the server after installing for changes to take effect.</p>
    </div>
  );
}

function VotifierTestSection({ serverId, section }: { serverId: string; section: Extract<Section, { type: "votifier_test" }> }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8192");
  const [token, setToken] = useState("");
  const [serviceName, setServiceName] = useState("TestService");
  const [username, setUsername] = useState("TestPlayer");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const sendTest = async () => {
    setIsSending(true);
    setResult(null);
    try {
      const res = await axios.post(`/api/servers/${serverId}/votifier-test`, { host, port, token, serviceName, username });
      setResult(res.data);
    } catch (e: any) {
      setResult({ success: false, message: e.response?.data?.error || "Failed to send test vote" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-muted-subtle border border-border-subtle rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">{section.title}</h3>
      <p className="text-xs text-muted-foreground mb-3">Sends a NuVotifier V2 (token-based) test vote. Classic Votifier (RSA, no token) isn't supported.</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input type="text" placeholder="Host (e.g. play.example.com)" value={host} onChange={(e) => setHost(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-theme-500 col-span-2" />
        <input type="text" placeholder="Port (e.g. 8192)" value={port} onChange={(e) => setPort(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-theme-500" />
        <input type="text" placeholder="Token" value={token} onChange={(e) => setToken(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-theme-500" />
        <input type="text" placeholder="Service name" value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-theme-500" />
        <input type="text" placeholder="Test username" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-theme-500" />
      </div>
      <button
        onClick={sendTest}
        disabled={isSending || !host || !port || !token}
        className="px-3 py-1.5 bg-theme-500/15 hover:bg-theme-500/25 text-theme-300 border border-theme-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
      >
        {isSending ? <div className="w-3 h-3 border-2 border-theme-300/50 border-t-theme-300 rounded-full animate-spin" /> : <Send size={12} />}
        Send Test Vote
      </button>
      {result && (
        <div className={`mt-3 p-2.5 rounded-lg text-xs flex items-start gap-2 ${result.success ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>
          {result.success ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}

export default function ExtensionPanel({ serverId, extension }: { serverId: string; extension: Extension }) {
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{extension.name}</h2>
        {extension.description && <p className="text-sm text-muted-foreground mt-0.5">{extension.description}</p>}
      </div>
      {extension.sections.map((section, i) => {
        if (section.type === "rcon_output") return <RconOutputSection key={i} serverId={serverId} section={section} />;
        if (section.type === "rcon_buttons") return <RconButtonsSection key={i} serverId={serverId} section={section} />;
        if (section.type === "download_install") return <DownloadInstallSection key={i} serverId={serverId} section={section} />;
        if (section.type === "votifier_test") return <VotifierTestSection key={i} serverId={serverId} section={section} />;
        if (section.type === "plugin_search") return <PluginManager key={i} serverId={serverId} />;
        return null;
      })}
    </div>
  );
}
