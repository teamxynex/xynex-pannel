import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  Server, Cpu, MemoryStick, HardDrive, Clock, Play, Square, RotateCcw, Terminal,
  FolderOpen, DatabaseBackup, Settings, Wrench, ChevronRight, Activity, Loader2,
  LifeBuoy, Plus, Archive,
} from "lucide-react";
import { ServerSummary, SystemStats, HistoryPoint } from "../../types/dashboard";
import { getGameBackground, useServerStats } from "./ServerCard";

/* ------------------------------------------------------------------ helpers */

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

export function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const isOnline = (s: ServerSummary) => s.status === "online";

/* ------------------------------------------------------------------ shells */

export function Panel({
  title, icon, action, children, className = "",
}: {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="nx-frame">
      <div className={`nx-frame-in ${className}`}>
        <span className="nx-corner tl" /><span className="nx-corner br" />
        {title && (
          <header className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 className="nx-display flex items-center gap-2.5 text-[13px] font-extrabold uppercase tracking-[0.14em] text-foreground">
              {icon && <span className="text-[var(--nx-a)] drop-shadow-[0_0_6px_var(--nx-a)]">{icon}</span>}
              {title}
            </h2>
            {action}
          </header>
        )}
        <div className={title ? "px-5 pb-5 pt-3.5" : ""}>{children}</div>
      </div>
    </section>
  );
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="text-[11px] font-bold uppercase tracking-widest text-[var(--nx-a)] hover:text-theme-200 transition-colors">
      View all →
    </Link>
  );
}

function IconBox({ children, size = "md" }: { children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={`nx-tile rounded-xl ${
        size === "sm" ? "h-9 w-9" : "h-11 w-11"
      }`}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- hero banner */

export function HeroBanner({
  username, panelName, panelLogo, action,
}: {
  username: string;
  panelName: string;
  panelLogo?: string;
  action?: React.ReactNode;
}) {
  const [bannerOk, setBannerOk] = useState(true);
  return (
    <section className="nx-frame">
      <div className="nx-frame-in !bg-black" style={{ ["--nx-cut" as any]: "24px" }}>
        <span className="nx-corner tl" /><span className="nx-corner tr" /><span className="nx-corner bl" /><span className="nx-corner br" />
        {/* Optional artwork: drop a file at public/dashboard-banner.jpg to use it. */}
        {bannerOk && (
          <img
            src="/dashboard-banner.jpg"
            alt=""
            onError={() => setBannerOk(false)}
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 140% at 88% 0%, color-mix(in srgb, var(--theme-500) 55%, transparent) 0%, transparent 60%)," +
              "radial-gradient(80% 120% at 100% 100%, color-mix(in srgb, var(--theme-700, var(--theme-600)) 70%, transparent) 0%, transparent 65%)," +
              "linear-gradient(rgba(var(--theme-rgb-500),0.06) 1px, transparent 1px) 0 0 / 32px 32px," +
              "linear-gradient(90deg, rgba(var(--theme-rgb-500),0.06) 1px, transparent 1px) 0 0 / 32px 32px," +
              "linear-gradient(90deg, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.2) 100%)",
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-7 md:px-9 md:py-9">
          <div className="min-w-0">
            <p className="nx-eyebrow">Command Center</p>
            <h1 className="nx-display mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-[40px] md:leading-none">
              Welcome back, <span className="nx-glow-text">{username}</span>
            </h1>
            <p className="mt-2.5 text-sm text-foreground-muted">Here's what's happening with your servers today.</p>
          </div>
          <div className="flex items-center gap-4">
            {action}
            <div className="hidden items-center gap-3 sm:flex">
              {panelLogo ? (
                <img src={panelLogo} alt="" className="h-11 w-11 rounded-xl object-cover border border-[var(--nx-line)]" />
              ) : (
                <span className="nx-tile h-11 w-11 rounded-xl">
                  <Server size={20} />
                </span>
              )}
              <span className="nx-display text-sm font-extrabold uppercase tracking-[0.25em] text-foreground">{panelName}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- stat tiles */

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <IconBox>{icon}</IconBox>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-muted-foreground sm:text-[10.5px] sm:tracking-[0.14em]">{label}</p>
          <p className="nx-display text-[28px] font-extrabold leading-tight tracking-tight text-foreground">{value}</p>
          <p className="text-xs leading-snug text-muted-foreground">{sub}</p>
        </div>
      </div>
    </Panel>
  );
}

export function StatTiles({ stats, servers }: { stats: SystemStats | null; servers: ServerSummary[] }) {
  const online = servers.filter(isOnline).length;
  const offline = servers.length - online;
  const usedMem = stats?.totalMemory && stats.freeMemory !== undefined ? stats.totalMemory - stats.freeMemory : undefined;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<Server size={20} />}
        label="Total Servers"
        value={servers.length}
        sub={
          <span>
            <span className="mr-2 inline-block whitespace-nowrap text-emerald-400">● {online} Online</span>
            <span className="inline-block whitespace-nowrap text-rose-400">● {offline} Offline</span>
          </span>
        }
      />
      <Tile
        icon={<Cpu size={20} />}
        label="Host RAM Usage"
        value={`${stats?.ramUsage ?? 0}%`}
        sub={usedMem !== undefined ? `${formatBytes(usedMem)} / ${formatBytes(stats?.totalMemory)}` : "—"}
      />
      <Tile
        icon={<HardDrive size={20} />}
        label="Host Disk Usage"
        value={`${stats?.diskUsage ?? 0}%`}
        sub={stats?.totalDisk ? `${formatBytes(stats.usedDisk)} / ${formatBytes(stats.totalDisk)}` : "—"}
      />
      <Tile
        icon={<Clock size={20} />}
        label="Host Uptime"
        value={formatUptime(stats?.uptimeSeconds)}
        sub="Since last reboot"
      />
    </div>
  );
}

/* ------------------------------------------------------------- sparkline */

function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const w = 160;
  const h = 44;
  if (values.length < 2) {
    return <div className={`flex items-center justify-center text-[10px] text-muted-foreground ${className}`}>collecting…</div>;
  }
  const max = Math.max(20, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--theme-400)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--theme-400)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#sparkfill)" />
      <path d={line} fill="none" stroke="var(--theme-400)" strokeWidth="1.75" style={{ filter: "drop-shadow(0 0 4px var(--theme-400))" }} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------------------------------------------------------------- my servers */

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
      <span className="text-theme-400">{icon}</span>
      {children}
    </span>
  );
}

function ServerLine({ server }: { server: ServerSummary }) {
  const online = isOnline(server);
  const live = useServerStats(server.id, online);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!live) return;
    setCpuHistory((prev) => [...prev, live.cpu].slice(-30));
  }, [live]);

  const bg = getGameBackground(server);
  const game = server.eggName || server.type || server.software;
  const ramLimitGb = server.memory ?? (live ? +(live.limitRam / 1024).toFixed(1) : undefined);
  const ramUsed = live ? (live.ram / 1024).toFixed(1) : null;
  const diskLimit = server.disk ?? live?.limitDisk;
  const status = server.suspended ? "Suspended" : online ? "Online" : server.status === "starting" ? "Starting" : "Offline";
  const statusColor = online ? "text-emerald-400" : server.status === "starting" ? "text-amber-400" : "text-rose-400";

  return (
    <div className="nx-row flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--nx-line)] bg-gradient-to-br from-theme-900/60 to-black">
        {bg && !imgFailed ? (
          <img src={bg} alt="" onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-theme-400">
            <Server size={26} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="nx-display truncate text-[15px] font-bold text-foreground">{server.name}</h3>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusColor}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> {status}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {game && <span className="rounded-md border border-theme-500/25 bg-theme-500/10 px-2 py-0.5 text-[11px] font-medium text-foreground-muted">{game}</span>}
          {server.version && <span className="rounded-md border border-border bg-white/5 px-2 py-0.5 text-[11px] font-medium text-foreground-muted">{server.version}</span>}
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          IP: {server.ipAlias || "—"}{server.port ? `:${server.port}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Chip icon={<MemoryStick size={13} />}>{ramUsed !== null ? `${ramUsed} / ${ramLimitGb ?? "--"} GB` : `${ramLimitGb ?? "--"} GB`}</Chip>
          <Chip icon={<Cpu size={13} />}>{live ? `${Math.round(live.cpu)}% CPU` : "-- CPU"}</Chip>
          <Chip icon={<HardDrive size={13} />}>{diskLimit !== undefined ? `${diskLimit} GB Disk` : "-- Disk"}</Chip>
        </div>
      </div>

      <Sparkline values={cpuHistory} className="hidden h-11 w-36 shrink-0 md:block" />

      <Link
        to={`/servers/${server.id}`}
        className="nx-btn w-full shrink-0 sm:ml-auto sm:w-auto"
      >
        Manage <ChevronRight size={15} />
      </Link>
    </div>
  );
}

export function MyServers({ servers, canCreate }: { servers: ServerSummary[]; canCreate: boolean }) {
  const shown = servers.slice(0, 4);
  return (
    <Panel title="My Servers" icon={<Server size={16} />} action={servers.length > 0 ? <ViewAll to="/servers" /> : undefined}>
      {shown.length === 0 ? (
        <div className="grid place-items-center gap-3 py-8 text-center">
          <IconBox><HardDrive size={22} /></IconBox>
          <div>
            <p className="text-sm font-bold text-foreground">No servers found</p>
            <p className="text-xs text-muted-foreground">You haven't deployed any servers yet.</p>
          </div>
          {canCreate && (
            <Link to="/admin?tab=createserver" className="nx-btn primary">
              <Plus size={15} /> Create Server
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((s) => <ServerLine key={s.id} server={s} />)}
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- performance chart */

type Series = "all" | "cpu" | "ram" | "disk";
const SERIES: { key: Exclude<Series, "all">; label: string; color: string }[] = [
  { key: "cpu", label: "CPU", color: "var(--theme-400)" },
  { key: "ram", label: "RAM", color: "var(--theme-200)" },
  { key: "disk", label: "Disk", color: "#fbbf24" },
];

export function PerformanceChart({ history }: { history: HistoryPoint[] }) {
  const [tab, setTab] = useState<Series>("all");
  const W = 520;
  const H = 190;
  const padL = 34;
  const padB = 22;
  const innerW = W - padL - 8;
  const innerH = H - padB - 8;
  const last = history[history.length - 1];

  const paths = useMemo(() => {
    if (history.length < 2) return [];
    return SERIES.map((s) => {
      const pts = history.map((p, i) => [padL + (i / (history.length - 1)) * innerW, 8 + innerH - (Math.min(100, p[s.key]) / 100) * innerH] as const);
      return { ...s, d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") };
    });
  }, [history, innerW, innerH]);

  const spanMs = history.length >= 2 ? history[history.length - 1].t - history[0].t : 0;
  const timeLabel = (t: number) =>
    new Date(t).toLocaleTimeString([], spanMs < 10 * 60 * 1000 ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const ticks = history.length >= 2 ? [history[0], history[Math.floor(history.length / 2)], history[history.length - 1]] : [];

  return (
    <Panel
      title="Host Performance"
      icon={<Activity size={16} />}
      action={
        <div role="tablist" className="flex overflow-hidden rounded-lg border border-[var(--nx-line)] text-[11px] font-bold tracking-wider">
          {(["all", "cpu", "ram", "disk"] as Series[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`px-2.5 py-1 uppercase transition-colors ${tab === k ? "bg-theme-500/30 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k}
            </button>
          ))}
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label="Host CPU, RAM and disk usage over time">
        {[0, 25, 50, 75, 100].map((v) => {
          const y = 8 + innerH - (v / 100) * innerH;
          return (
            <g key={v}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="currentColor" className="text-white/10" strokeDasharray="3 4" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">{v}%</text>
            </g>
          );
        })}
        {paths.filter((p) => tab === "all" || p.key === tab).map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${p.color})` }} />
        ))}
        {ticks.map((p, i) => (
          <text key={i} x={padL + (i / 2) * innerW} y={H - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="fill-muted-foreground" fontSize="9">
            {timeLabel(p.t)}
          </text>
        ))}
        {history.length < 2 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-muted-foreground" fontSize="12">Collecting live data…</text>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-foreground-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-semibold text-foreground">{last ? `${Math.round(last[s.key])}%` : "--"}</span>
          </span>
        ))}
        <span className="ml-auto text-muted-foreground">Live, since you opened the panel</span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ recent activity */

interface ActivityItem {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  serverName?: string | null;
  username?: string;
}

function activityIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes("restart")) return { icon: <RotateCcw size={15} />, tone: "text-amber-300 bg-amber-500/15 border-amber-500/30" };
  if (a.includes("stop") || a.includes("kill") || a.includes("terminate")) return { icon: <Square size={15} />, tone: "text-rose-300 bg-rose-500/15 border-rose-500/30" };
  if (a.includes("start")) return { icon: <Play size={15} />, tone: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" };
  if (a.includes("backup")) return { icon: <DatabaseBackup size={15} />, tone: "text-violet-300 bg-violet-500/15 border-violet-500/30" };
  return { icon: <Activity size={15} />, tone: "text-theme-300 bg-theme-500/15 border-theme-500/30" };
}

export function RecentActivity({ servers }: { servers: ServerSummary[] }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const ids = servers.slice(0, 6).map((s) => s.id).join(",");

  useEffect(() => {
    if (!ids) { setItems([]); return; }
    let cancelled = false;
    const load = async () => {
      const results = await Promise.allSettled(
        ids.split(",").map((id) => axios.get<ActivityItem[]>(`/api/servers/${id}/activity`, { params: { limit: 6 } }))
      );
      if (cancelled) return;
      const merged = results
        .flatMap((r) => (r.status === "fulfilled" ? r.value.data : []))
        .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
        .slice(0, 5);
      setItems(merged);
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [ids]);

  return (
    <Panel title="Recent Activity" icon={<Activity size={16} />}>
      {items === null ? (
        <div className="grid place-items-center py-8 text-muted-foreground"><Loader2 className="animate-spin" size={18} /></div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No activity yet. Actions on your servers will show up here.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it) => {
            const { icon, tone } = activityIcon(it.action);
            return (
              <li key={it.id} className="flex items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${tone}`}>{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{it.description}</p>
                  <p className="truncate text-xs text-muted-foreground">{it.serverName || it.username || it.action}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(it.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- quick actions */

type QuickAction = {
  key: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  power?: "start" | "stop" | "restart";
  path?: string; // appended to /servers/:id
};

const QUICK_ACTIONS: QuickAction[] = [
  { key: "start", icon: <Play size={16} />, title: "Start Server", sub: "Power on your server", power: "start" },
  { key: "stop", icon: <Square size={16} />, title: "Stop Server", sub: "Power off your server", power: "stop" },
  { key: "restart", icon: <RotateCcw size={16} />, title: "Restart Server", sub: "Restart your server", power: "restart" },
  { key: "console", icon: <Terminal size={16} />, title: "Open Console", sub: "Access live terminal", path: "" },
  { key: "files", icon: <FolderOpen size={16} />, title: "File Manager", sub: "Browse and edit your files", path: "/files" },
  { key: "backup", icon: <Archive size={16} />, title: "Create Backup", sub: "Save your server data", path: "/backup" },
  { key: "reinstall", icon: <Wrench size={16} />, title: "Reinstall Server", sub: "Open settings to reinstall", path: "/settings" },
  { key: "manage", icon: <Settings size={16} />, title: "Manage Server", sub: "Settings & configuration", path: "/settings" },
];

function ServerPicker({
  action, servers, onPick, onClose,
}: {
  action: QuickAction;
  servers: ServerSummary[];
  onPick: (s: ServerSummary) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = servers.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  // Portal to <body>: the Panel's backdrop-blur would otherwise trap a fixed overlay inside the card.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${action.title}: choose a server`}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--nx-line)] bg-[var(--nx-panel)] shadow-[0_30px_80px_-20px] shadow-theme-500/40"
      >
        <div className="flex items-center gap-3 border-b border-theme-500/15 px-5 py-4">
          <IconBox size="sm">{action.icon}</IconBox>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-foreground">{action.title}</h3>
            <p className="text-xs text-muted-foreground">Choose a server</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {servers.length > 5 && (
          <div className="px-5 pt-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search servers…"
              className="w-full rounded-lg border border-theme-500/25 bg-black/60 px-3 py-2 text-sm text-foreground outline-none focus:border-theme-500"
            />
          </div>
        )}

        <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto p-3">
          {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No servers match.</li>}
          {list.map((s) => {
            const on = isOnline(s);
            const blocked =
              (action.power === "start" && on) ? "Already online" :
              (action.power === "stop" && !on) ? "Already offline" : "";
            return (
              <li key={s.id}>
                <button
                  onClick={() => onPick(s)}
                  disabled={!!blocked}
                  className="group flex w-full items-center gap-3 nx-row px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <IconBox size="sm"><Server size={16} /></IconBox>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {blocked || `${s.ipAlias || "—"}${s.port ? `:${s.port}` : ""}`}
                    </span>
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${on ? "text-emerald-400" : "text-rose-400"}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> {s.suspended ? "Suspended" : on ? "Online" : "Offline"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}

export function QuickActions({ servers, onChanged }: { servers: ServerSummary[]; onChanged: () => void }) {
  const navigate = useNavigate();
  const [picking, setPicking] = useState<QuickAction | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (action: QuickAction, server: ServerSummary) => {
    setPicking(null);
    if (action.power) {
      setBusy(action.key);
      setMsg(null);
      try {
        await axios.post(`/api/servers/${server.id}/${action.power}`);
        setMsg({ ok: true, text: `${server.name}: ${action.power} sent` });
        setTimeout(onChanged, 1500);
      } catch (e: any) {
        setMsg({ ok: false, text: e.response?.data?.error || `Couldn't ${action.power} ${server.name}` });
      } finally {
        setBusy(null);
      }
    } else {
      navigate(`/servers/${server.id}${action.path ?? ""}`);
    }
  };

  const onClick = (action: QuickAction) => {
    setMsg(null);
    if (servers.length === 1) run(action, servers[0]); // nothing to choose
    else setPicking(action);
  };

  return (
    <Panel title="Quick Actions" icon={<Activity size={16} />}>
      <div className="space-y-1.5">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => onClick(a)}
            disabled={servers.length === 0 || busy !== null}
            className="group flex w-full items-center gap-3 nx-row px-3 py-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconBox size="sm">{busy === a.key ? <Loader2 size={16} className="animate-spin" /> : a.icon}</IconBox>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-foreground">{a.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{a.sub}</span>
            </span>
            <ChevronRight size={15} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
      {servers.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Create a server to use quick actions.</p>}
      {msg && <p role="status" className={`mt-3 text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>}
      {picking && <ServerPicker action={picking} servers={servers} onPick={(s) => run(picking, s)} onClose={() => setPicking(null)} />}
    </Panel>
  );
}

/* ------------------------------------------------------------- status + system */

export function ServerStatusList({ servers }: { servers: ServerSummary[] }) {
  return (
    <Panel title="Server Status" icon={<Server size={16} />} action={servers.length > 0 ? <ViewAll to="/servers" /> : undefined}>
      {servers.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">No servers yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {servers.slice(0, 5).map((s) => {
            const on = isOnline(s);
            return (
              <li key={s.id}>
                <Link to={`/servers/${s.id}`} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-theme-500/10">
                  <IconBox size="sm"><Server size={16} /></IconBox>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{s.ipAlias || "—"}{s.port ? `:${s.port}` : ""}</span>
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${on ? "text-emerald-400" : "text-rose-400"}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> {s.suspended ? "Suspended" : on ? "Online" : "Offline"}
                  </span>
                  <ChevronRight size={15} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Meter({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <IconBox size="sm">{icon}</IconBox>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">{label}</span>
          <span className="font-bold text-foreground">{v}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${v}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
        </div>
      </div>
    </div>
  );
}

export function SystemOverview({ stats, servers }: { stats: SystemStats | null; servers: ServerSummary[] }) {
  const online = servers.filter(isOnline).length;
  return (
    <Panel title="System Overview" icon={<Cpu size={16} />}>
      <div className="space-y-3.5">
        <Meter icon={<Cpu size={16} />} label="CPU Usage" value={stats?.cpuPercent ?? 0} color="var(--theme-400)" />
        <Meter icon={<MemoryStick size={16} />} label="RAM Usage" value={stats?.ramUsage ?? 0} color="var(--theme-200)" />
        <Meter icon={<HardDrive size={16} />} label="Disk Usage" value={stats?.diskUsage ?? 0} color="#fbbf24" />
        <Meter icon={<Server size={16} />} label="Servers Online" value={servers.length ? (online / servers.length) * 100 : 0} color="var(--theme-500)" />
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- help strip */

export function HelpStrip() {
  return (
    <Panel className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <IconBox><LifeBuoy size={22} /></IconBox>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Need Help?</p>
          <p className="text-xs text-muted-foreground">Our support team is always here for you.</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("xynex:open-support"))}
          className="nx-btn"
        >
          Create Ticket
        </button>
      </div>
    </Panel>
  );
}
