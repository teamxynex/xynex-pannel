import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Blocks, Bot, Eye, EyeOff, Loader2, Save, Upload, X, Sparkles, MessageSquare, ExternalLink } from "lucide-react";
import { useNotification } from "../context/NotificationContext";

export default function IntegrationsManager() {
  const { notify } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCfKey, setShowCfKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [curseforgeApiKey, setCurseforgeApiKey] = useState("");
  const [aiSupportEnabled, setAiSupportEnabled] = useState(false);
  const [aiSupportProvider, setAiSupportProvider] = useState<"groq" | "gemini">("groq");
  const [aiSupportGroqApiKey, setAiSupportGroqApiKey] = useState("");
  const [aiSupportGeminiApiKey, setAiSupportGeminiApiKey] = useState("");
  const [aiSupportName, setAiSupportName] = useState("");
  const [aiSupportLogo, setAiSupportLogo] = useState("");

  const [enableDiscordConnect, setEnableDiscordConnect] = useState(false);
  const [discordClientId, setDiscordClientId] = useState("");
  const [discordClientSecret, setDiscordClientSecret] = useState("");
  const [showDiscordSecret, setShowDiscordSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");

  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [discordNotifyServerEvents, setDiscordNotifyServerEvents] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/api/auth/discord/callback`);
  }, []);

  useEffect(() => {
    axios.get("/api/system/integrations").then((res) => {
      const d = res.data;
      setCurseforgeApiKey(d.curseforgeApiKey || "");
      setAiSupportEnabled(!!d.aiSupportEnabled);
      setAiSupportProvider(d.aiSupportProvider === "gemini" ? "gemini" : "groq");
      setAiSupportGroqApiKey(d.aiSupportGroqApiKey || "");
      setAiSupportGeminiApiKey(d.aiSupportGeminiApiKey || "");
      setAiSupportName(d.aiSupportName || "");
      setAiSupportLogo(d.aiSupportLogo || "");
      setEnableDiscordConnect(!!d.enableDiscordConnect);
      setDiscordClientId(d.discordClientId || "");
      setDiscordClientSecret(d.discordClientSecret || "");
      setDiscordWebhookUrl(d.discordWebhookUrl || "");
      setDiscordNotifyServerEvents(!!d.discordNotifyServerEvents);
    }).catch(() => notify("Failed to load integration settings.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogoUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAiSupportLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put("/api/system/settings", {
        curseforgeApiKey,
        aiSupportEnabled,
        aiSupportProvider,
        aiSupportGroqApiKey,
        aiSupportGeminiApiKey,
        aiSupportName,
        aiSupportLogo,
        enableDiscordConnect,
        discordClientId,
        discordClientSecret,
        discordWebhookUrl,
        discordNotifyServerEvents,
      });
      notify("Integration settings saved.", "success");
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to save integration settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground animate-pulse mt-8">Loading integrations...</div>;
  }

  return (
    <div className="bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl mt-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center text-foreground">
            <Blocks className="mr-3 text-theme-400 w-5 h-5" /> Upload Your API Keys
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Third-party integrations for the panel. Keys are stored server-side and never shown to regular users.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-theme-500 hover:bg-theme-600 text-foreground font-medium rounded-xl transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* CurseForge */}
      <div className="p-5 bg-muted-subtle border border-border-subtle rounded-2xl mb-6">
        <h3 className="text-sm font-bold text-foreground mb-1">CurseForge</h3>
        <p className="text-xs text-muted-foreground mb-3">Powers the "Browse Worlds" tab in World Manager. Get a free key at console.curseforge.com.</p>
        <div className="relative max-w-lg">
          <input
            type={showCfKey ? "text" : "password"}
            value={curseforgeApiKey}
            onChange={(e) => setCurseforgeApiKey(e.target.value)}
            placeholder="Paste your CurseForge API key"
            className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm font-mono text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
          />
          <button type="button" onClick={() => setShowCfKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showCfKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* AI Support */}
      <div className="p-5 bg-muted-subtle border border-border-subtle rounded-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-theme-400" /> AI Support
          </h3>
          <button
            type="button"
            onClick={() => setAiSupportEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiSupportEnabled ? "bg-theme-500" : "bg-zinc-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiSupportEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Shows a floating support button to every logged-in user. Users chat with AI first, and can hand the conversation to an online admin as a ticket.
        </p>

        <div className={aiSupportEnabled ? "" : "opacity-50 pointer-events-none"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Assistant Name</label>
              <input
                value={aiSupportName}
                onChange={(e) => setAiSupportName(e.target.value)}
                placeholder="e.g. XyneX Assistant"
                className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Assistant Logo</label>
              <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/40 border border-border flex items-center justify-center shrink-0">
                  {aiSupportLogo ? <img src={aiSupportLogo} alt="" className="w-full h-full object-cover" /> : <Sparkles className="w-4 h-4 text-muted-foreground" />}
                </div>
                <button type="button" onClick={() => logoInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-muted hover:bg-muted-hover text-foreground rounded-lg transition-colors">
                  <Upload size={14} /> Upload
                </button>
                {aiSupportLogo && (
                  <button type="button" onClick={() => setAiSupportLogo("")} className="p-2 text-muted-foreground hover:text-red-400 rounded-lg transition-colors" title="Remove logo">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">AI Provider</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {(["groq", "gemini"] as const).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setAiSupportProvider(p)}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                  aiSupportProvider === p ? "border-theme-500 bg-theme-500/10" : "border-border-subtle bg-black/20 hover:bg-black/30"
                }`}
              >
                <span className="font-bold text-sm text-foreground">{p === "groq" ? "Groq" : "Google Gemini"}</span>
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${aiSupportProvider === p ? "border-theme-400" : "border-muted-foreground"}`}>
                  {aiSupportProvider === p && <span className="w-2 h-2 rounded-full bg-theme-400" />}
                </span>
              </button>
            ))}
          </div>

          {aiSupportProvider === "groq" ? (
            <div className="relative max-w-lg">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Groq API Key</label>
              <input
                type={showAiKey ? "text" : "password"}
                value={aiSupportGroqApiKey}
                onChange={(e) => setAiSupportGroqApiKey(e.target.value)}
                placeholder="Paste your Groq API key (console.groq.com)"
                className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm font-mono text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
              />
              <button type="button" onClick={() => setShowAiKey((v) => !v)} className="absolute right-3 top-9 text-muted-foreground hover:text-foreground">
                {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          ) : (
            <div className="relative max-w-lg">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Gemini API Key</label>
              <input
                type={showAiKey ? "text" : "password"}
                value={aiSupportGeminiApiKey}
                onChange={(e) => setAiSupportGeminiApiKey(e.target.value)}
                placeholder="Paste your Gemini API key (aistudio.google.com)"
                className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm font-mono text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
              />
              <button type="button" onClick={() => setShowAiKey((v) => !v)} className="absolute right-3 top-9 text-muted-foreground hover:text-foreground">
                {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Discord Account Connect */}
      <div className="p-5 bg-muted-subtle border border-border-subtle rounded-2xl mt-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#5865F2]" /> Discord Account Connect
          </h3>
          <button
            type="button"
            onClick={() => setEnableDiscordConnect((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableDiscordConnect ? "bg-theme-500" : "bg-zinc-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enableDiscordConnect ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Lets users link their Discord account from the Settings page (identity only — no server access, no message reading).
        </p>

        <div className={enableDiscordConnect ? "" : "opacity-50 pointer-events-none"}>
          <div className="p-3 bg-black/30 border border-border-subtle rounded-xl mb-4 text-xs text-muted-foreground">
            <p className="font-bold text-foreground mb-1">Setup:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Create an app at <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-[#5865F2] underline inline-flex items-center gap-1">Discord Developer Portal <ExternalLink size={11} /></a></li>
              <li>Go to <strong>OAuth2</strong> and add this exact Redirect URL:</li>
            </ol>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 bg-black/40 px-2 py-1.5 rounded-lg text-[11px] font-mono text-foreground break-all">{redirectUri}</code>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(redirectUri); notify("Copied!", "success"); }}
                className="px-2.5 py-1.5 text-[11px] font-bold bg-muted hover:bg-muted-hover text-foreground rounded-lg transition-colors flex-shrink-0"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Client ID</label>
              <input
                value={discordClientId}
                onChange={(e) => setDiscordClientId(e.target.value)}
                placeholder="1234567890123456789"
                className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
              />
            </div>
            <div className="relative">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Client Secret</label>
              <input
                type={showDiscordSecret ? "text" : "password"}
                value={discordClientSecret}
                onChange={(e) => setDiscordClientSecret(e.target.value)}
                placeholder="Paste your Client Secret"
                className="w-full bg-black/40 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm font-mono text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
              />
              <button type="button" onClick={() => setShowDiscordSecret((v) => !v)} className="absolute right-3 top-9 text-muted-foreground hover:text-foreground">
                {showDiscordSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Discord Webhook Notifications */}
      <div className="p-5 bg-muted-subtle border border-border-subtle rounded-2xl mt-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-theme-400" /> Discord Webhook Notifications</h3>
            <p className="text-xs text-muted-foreground mt-1">Post a message to a Discord channel whenever a server is created, deleted, suspended, or unsuspended.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
            <input
              type="checkbox"
              checked={discordNotifyServerEvents}
              onChange={(e) => setDiscordNotifyServerEvents(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 bg-black/40 border border-border rounded-xl px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-theme-500/50 transition-colors"
          />
          <button
            type="button"
            onClick={async () => {
              setTestingWebhook(true);
              try {
                await axios.post("/api/system/test-discord-webhook", { webhookUrl: discordWebhookUrl });
                notify("Test message sent — check your Discord channel!", "success");
              } catch (e: any) {
                notify(e.response?.data?.error || "Failed to send test message.", "error");
              } finally {
                setTestingWebhook(false);
              }
            }}
            disabled={testingWebhook || !discordWebhookUrl}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-muted hover:bg-muted-hover text-foreground text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {testingWebhook ? "Sending…" : "Send Test"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Create one under your Discord channel's Settings → Integrations → Webhooks.</p>
      </div>
    </div>
  );
}
