// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ServerList · Neon sci-fi fleet view (matches the AI mockup)               ║
// ║  Data/polling/admin logic unchanged — only the visual layer is new.        ║
// ║  Colours follow the admin-selected panel theme (--theme-* vars).         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/* ── Imports ──────────────────────────────────────────────────────────────── */
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Server, Plus, ChevronRight, Settings, Lock, Terminal, FileCode2, Coffee, Gamepad2, Cpu, MemoryStick, Database, Box } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import "./ServerList.css";

/* ── Types ────────────────────────────────────────────────────────────────── */
type ServerStatus = "online" | "offline" | (string & {});

interface ServerRecord {
  id: string;
  name: string;
  status: ServerStatus;
  cpu?: number;
  ram?: number;
  disk?: number;
  version?: string;
  suspended?: boolean;
  eggName?: string;
  type?: string;
  software?: string;
}

interface ServersState {
  servers: ServerRecord[];
  error: string | null;
  isLoading: boolean;
}

interface LiveStats { cpu: number; ramMB: number }

/* ── Constants ────────────────────────────────────────────────────────────── */
const EASE = [0.22, 1, 0.36, 1] as const;
const POLL_INTERVAL_MS = 5_000;
const DEFAULT_CPU = 100;
const DEFAULT_RAM = 1;
const DEFAULT_DISK = 10;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

const isOnline = (status?: ServerStatus): boolean => status === "online";

/* ── Data hooks ───────────────────────────────────────────────────────────── */
function useServers(pollIntervalMs = POLL_INTERVAL_MS): ServersState {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchServers = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await axios.get<ServerRecord[]>("/api/servers", { signal });
      setServers(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError("Unable to load servers. Retrying…");
      console.error("Failed to fetch servers:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchServers(controller.signal);
    const interval = window.setInterval(() => void fetchServers(controller.signal), pollIntervalMs);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [fetchServers, pollIntervalMs]);

  return { servers, error, isLoading };
}

/** Live CPU % and RAM (MB) for one server; only polls while it is online. */
function useLiveStats(serverId: string, online: boolean): LiveStats | null {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    if (!online) {
      setStats(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await axios.get(`/api/servers/${serverId}/stats`);
        if (alive) setStats({ cpu: Number(res.data.cpu) || 0, ramMB: Number(res.data.ram) || 0 });
      } catch {
        /* keep last value */
      }
    };
    void load();
    const t = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [serverId, online]);

  return stats;
}

/* ── Procedural artwork (no image files needed) ───────────────────────────── */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const Skyline = memo(function Skyline({ seed, moon = false }: { seed: number; moon?: boolean }) {
  const shapes = useMemo(() => {
    const r = rng(seed);
    const out: { x: number; w: number; h: number; wins: { x: number; y: number }[]; spire: boolean }[] = [];
    let x = -10;
    while (x < 820) {
      const w = 22 + r() * 46;
      const h = 40 + r() * 120 * (0.4 + Math.abs(Math.sin(x / 140 + seed)));
      const wins: { x: number; y: number }[] = [];
      for (let wy = 200 - h + 10; wy < 192; wy += 11) {
        for (let wx = x + 5; wx < x + w - 5; wx += 8) if (r() > 0.72) wins.push({ x: wx, y: wy });
      }
      out.push({ x, w, h, wins, spire: r() > 0.7 });
      x += w + 2 + r() * 6;
    }
    return out;
  }, [seed]);

  return (
    <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMax slice" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`sk${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--theme-900)" />
          <stop offset="1" stopColor="var(--theme-950)" />
        </linearGradient>
        <radialGradient id={`mn${seed}`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="var(--theme-200)" stopOpacity=".9" />
          <stop offset="1" stopColor="var(--theme-400)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {moon && (
        <g>
          <circle cx="640" cy="62" r="70" fill={`url(#mn${seed})`} opacity=".35" />
          <circle cx="640" cy="62" r="34" fill="var(--theme-950)" stroke="var(--theme-400)" strokeOpacity=".55" />
        </g>
      )}
      {shapes.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={200 - b.h} width={b.w} height={b.h} fill={`url(#sk${seed})`} stroke="var(--theme-400)" strokeOpacity=".18" />
          {b.spire && <rect x={b.x + b.w / 2 - 0.75} y={200 - b.h - 18} width="1.5" height="18" fill="var(--theme-400)" opacity=".5" />}
          {b.wins.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width="3" height="4" fill="var(--theme-400)" opacity=".55" />
          ))}
        </g>
      ))}
    </svg>
  );
});

const Streaks = memo(function Streaks({ seed }: { seed: number }) {
  const lines = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 34 }, () => ({ x: r() * 620 + 80, y: r() * 120 - 20, l: 40 + r() * 120, o: 0.12 + r() * 0.4 }));
  }, [seed]);
  return (
    <svg viewBox="0 0 700 200" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      {lines.map((l, i) => (
        <line key={i} x1={l.x} y1={l.y} x2={l.x - l.l * 0.55} y2={l.y + l.l} stroke="var(--theme-400)" strokeOpacity={l.o} strokeWidth="1.4" />
      ))}
      <circle cx="560" cy="100" r="80" fill="none" stroke="var(--theme-400)" strokeOpacity=".14" />
      <circle cx="560" cy="100" r="52" fill="none" stroke="var(--theme-400)" strokeOpacity=".22" strokeDasharray="4 6" />
      <circle cx="560" cy="100" r="22" fill="var(--theme-400)" fillOpacity=".12" stroke="var(--theme-400)" strokeOpacity=".6" />
    </svg>
  );
});

/** The big "X" mark used in the page header. */
function XMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <filter id="xglow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#xglow)" fill="none" stroke="var(--theme-400)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M18 14 L50 46 L82 14" />
        <path d="M18 86 L50 54 L82 86" />
        <path d="M14 18 L46 50 L14 82" opacity=".75" />
        <path d="M86 18 L54 50 L86 82" opacity=".75" />
      </g>
    </svg>
  );
}

/* ── STEP 5b · Server banner (game art or language card) ─────────────────── */
// Curated Steam header-art backgrounds for common game eggs, keyed off the
// egg/type/software label. Anything not recognized falls back to a
// language/generic banner below — no broken images.
const GAME_BACKGROUNDS: { match: RegExp; appId: string }[] = [
  { match: /project ?zomboid|zomboid/i, appId: "108600" },
  { match: /\brust\b/i, appId: "252490" },
  { match: /\bark\b|survival evolved/i, appId: "346110" },
  { match: /valheim/i, appId: "892970" },
  { match: /terraria/i, appId: "105600" },
  { match: /counter-?strike ?2|\bcs2\b/i, appId: "730" },
  { match: /counter-?strike|csgo|cs:?go/i, appId: "730" },
  { match: /garry'?s mod|\bgmod\b/i, appId: "4000" },
  { match: /team fortress ?2|\btf2\b/i, appId: "440" },
  { match: /left 4 dead ?2|l4d2/i, appId: "550" },
  { match: /7 days to die/i, appId: "251570" },
  { match: /unturned/i, appId: "304930" },
  { match: /satisfactory/i, appId: "526870" },
  { match: /palworld/i, appId: "1623730" },
  { match: /scp:? ?secret laboratory|scpsl/i, appId: "700330" },
  { match: /barotrauma/i, appId: "602960" },
  { match: /space engineers/i, appId: "244850" },
  { match: /v ?rising/i, appId: "1604030" },
  { match: /fivem/i, appId: "" },
  { match: /minecraft|paper|spigot|forge|fabric|purpur|bukkit/i, appId: "" },
];

// Coding-language / app-hosting eggs: shown as a gradient card with the
// language's icon + name instead of a game screenshot.
const LANGUAGE_BANNERS: { match: RegExp; label: string; icon: ReactNode; gradient: string }[] = [
  { match: /node\.?js/i, label: "Node.js", icon: <Terminal className="h-9 w-9" />, gradient: "from-emerald-600/70 via-emerald-900/60 to-black" },
  { match: /python/i, label: "Python", icon: <FileCode2 className="h-9 w-9" />, gradient: "from-blue-600/70 via-yellow-600/40 to-black" },
  { match: /\bjava\b/i, label: "Java", icon: <Coffee className="h-9 w-9" />, gradient: "from-orange-600/70 via-red-900/50 to-black" },
  { match: /\bphp\b/i, label: "PHP", icon: <FileCode2 className="h-9 w-9" />, gradient: "from-theme-600/70 via-slate-800/60 to-black" },
  { match: /\bgo\b|golang/i, label: "Go", icon: <Terminal className="h-9 w-9" />, gradient: "from-cyan-600/70 via-sky-900/50 to-black" },
  { match: /rust ?lang|\.rs\b/i, label: "Rust", icon: <Terminal className="h-9 w-9" />, gradient: "from-orange-700/70 via-stone-900/60 to-black" },
  { match: /minecraft|paper|spigot|forge|fabric|purpur|bukkit/i, label: "Minecraft", icon: <Gamepad2 className="h-9 w-9" />, gradient: "from-green-700/70 via-emerald-950/60 to-black" },
  { match: /fivem/i, label: "FiveM", icon: <Gamepad2 className="h-9 w-9" />, gradient: "from-orange-600/70 via-amber-900/50 to-black" },
];

interface ServerBanner {
  kind: "image" | "language";
  image?: string;
  label?: string;
  icon?: ReactNode;
  gradient?: string;
}

function getServerBanner(server: ServerRecord): ServerBanner {
  const label = `${server.eggName || ""} ${server.type || ""} ${server.software || ""}`.trim();

  if (label) {
    const game = GAME_BACKGROUNDS.find((g) => g.match.test(label) && g.appId);
    if (game) {
      return { kind: "image", image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg` };
    }
    const lang = LANGUAGE_BANNERS.find((l) => l.match.test(label));
    if (lang) {
      return { kind: "language", label: lang.label, icon: lang.icon, gradient: lang.gradient };
    }
  }

  return {
    kind: "language",
    label: label || "Server",
    icon: <Server className="h-9 w-9" />,
    gradient: "from-theme-950 via-slate-950 to-black",
  };
}

/* ── Primitives ───────────────────────────────────────────────────────────── */
function Corners() {
  return (
    <>
      <span className="sv-corner tl" />
      <span className="sv-corner tr" />
      <span className="sv-corner bl" />
      <span className="sv-corner br" />
    </>
  );
}

function StatusPill({ status, suspended }: { status?: ServerStatus; suspended?: boolean }) {
  if (suspended) {
    return (
      <span className="sv-pill sus">
        <Lock className="h-3 w-3" />
        SUSPENDED
      </span>
    );
  }
  const online = isOnline(status);
  return (
    <span className={`sv-pill ${online ? "" : "off"}`}>
      <span className="dot" />
      {online ? "ONLINE" : "OFFLINE"}
    </span>
  );
}

function Metric({ icon, label, value, unit, pct }: { icon: ReactNode; label: string; value: ReactNode; unit?: ReactNode; pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="sv-metric">
      <div className="flex items-center gap-3">
        <span className="sv-tile h-9 w-9 shrink-0 rounded-[10px]">{icon}</span>
        <div className="min-w-0">
          <p className="sv-metric-label">{label}</p>
          <p className="sv-metric-value sv-display truncate">
            {value}
            {unit && <small> {unit}</small>}
          </p>
        </div>
      </div>
      <div className="sv-bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
        <i className={p > 90 ? "hot" : p > 75 ? "warn" : ""} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

/* ── ServerCard ───────────────────────────────────────────────────────────── */
const ServerCard = memo(function ServerCard({ server }: { server: ServerRecord }) {
  const online = isOnline(server.status);
  const suspended = !!server.suspended;
  const banner = useMemo(() => getServerBanner(server), [server.eggName, server.type, server.software]);
  const [bannerFailed, setBannerFailed] = useState(false);
  const live = useLiveStats(server.id, online && !suspended);

  const seed = useMemo(() => hashStr(server.id || server.name), [server.id, server.name]);
  const cpuLimit = server.cpu ?? DEFAULT_CPU;
  const ramLimit = server.ram ?? DEFAULT_RAM;
  const diskLimit = server.disk ?? DEFAULT_DISK;
  const cpuNow = live ? live.cpu : 0;
  const ramNowGB = live ? live.ramMB / 1024 : 0;

  const frameClass = suspended ? "is-sus" : online ? "" : "is-off";
  const hasGameArt = banner.kind === "image" && banner.image && !bannerFailed;

  return (
    <motion.article variants={itemVariants} className="h-full">
      <div className={`sv-frame ${frameClass} h-full`}>
        <div className="sv-frame-in flex h-full flex-col gap-4 p-5">
          <Corners />

          {/* artwork */}
          <div className="sv-art" aria-hidden>
            {hasGameArt ? (
              <img src={banner.image} alt="" onError={() => setBannerFailed(true)} />
            ) : seed % 2 === 0 ? (
              <Skyline seed={seed} moon />
            ) : (
              <Streaks seed={seed} />
            )}
          </div>

          {/* title block */}
          <div className="relative z-[2] flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <StatusPill status={server.status} suspended={suspended} />
            </div>
            <div className="flex items-center gap-4">
              <span className="sv-tile h-14 w-14 rounded-2xl">
                <Server className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <h2 className="sv-display truncate text-[30px] font-bold leading-none tracking-tight text-white">{server.name}</h2>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--text-muted-foreground)]">
                  <Cpu className="h-3.5 w-3.5 text-[var(--sv-a)]" />
                  <span className="font-mono">
                    {live ? ramNowGB.toFixed(1) : "0.0"} / {ramLimit} GB
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* metrics */}
          <div className="sv-metrics relative z-[2] mt-2">
            <Metric
              icon={<Cpu className="h-[18px] w-[18px]" />}
              label="CPU USAGE"
              value={`${Math.round(cpuNow)}%`}
              unit={`/ ${cpuLimit}%`}
              pct={(cpuNow / cpuLimit) * 100}
            />
            <Metric
              icon={<MemoryStick className="h-[18px] w-[18px]" />}
              label="RAM USAGE"
              value={`${ramNowGB.toFixed(1)} / ${ramLimit}`}
              unit="GB"
              pct={(ramNowGB / ramLimit) * 100}
            />
            <Metric
              icon={<Database className="h-[18px] w-[18px]" />}
              label="DISK LIMIT"
              value={diskLimit}
              unit="GB"
              pct={100}
            />
          </div>

          {/* footer */}
          <div className="sv-foot relative z-[2] mt-auto">
            <div className="flex min-w-0 items-center gap-3">
              <span className="sv-tile h-10 w-10 rounded-xl">
                <Box className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="sv-metric-label">VERSION</p>
                <p className="sv-display truncate text-base font-bold text-white" title={server.version}>
                  {server.version ?? "—"}
                </p>
              </div>
            </div>
            {suspended ? (
              <span className="sv-btn disabled">
                <Lock className="h-4 w-4" />
                Suspended
              </span>
            ) : (
              <Link to={`/servers/${server.id}`} className="sv-btn" aria-label={`Manage ${server.name}`}>
                <Settings className="h-4 w-4" />
                Manage
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
});

/* ── Sections ─────────────────────────────────────────────────────────────── */
function LoadingState() {
  return (
    <div className="sv-root flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sv-line)] border-t-[var(--sv-a)] motion-reduce:animate-none" aria-hidden />
      <p className="text-sm font-medium text-[var(--text-muted-foreground)]">Loading servers…</p>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <motion.div variants={itemVariants} className="sv-frame col-span-full">
      <div className="sv-frame-in flex flex-col items-center justify-center px-6 py-20 text-center">
        <Corners />
        <span className="sv-tile mb-5 h-14 w-14 rounded-2xl">
          <Server className="h-6 w-6" />
        </span>
        <h3 className="sv-display text-xl font-bold text-white">No servers yet</h3>
        <p className="mt-1 max-w-sm text-sm text-[var(--text-muted-foreground)]">
          {isAdmin ? "Create your first server to start managing it here." : "Servers assigned to you will show up here."}
        </p>
        {isAdmin && (
          <Link to="/admin?tab=createserver" className="sv-btn primary mt-6">
            <Plus className="h-4 w-4" />
            New Server
          </Link>
        )}
      </div>
    </motion.div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ServerList() {
  const { user } = useAuth();
  const { servers, error, isLoading } = useServers();

  // `user` is undefined while auth restores — wait before deciding on admin controls.
  const isAuthReady = user !== undefined;
  const isAdmin = isAuthReady && user?.role === "admin";
  const hasServers = servers.length > 0;

  const onlineCount = useMemo(() => servers.reduce((n, s) => n + (isOnline(s.status) ? 1 : 0), 0), [servers]);

  if (!isAuthReady || (isLoading && !hasServers)) return <LoadingState />;

  return (
    <div className="sv-root">
      <div className="relative mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-8">
        {/* Hero */}
        <header className="sv-frame mb-6">
          <div className="sv-frame-in">
            <Corners />
            <div className="sv-hero-art" aria-hidden>
              <Skyline seed={2026} />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-28 w-28 -translate-x-1/2 -translate-y-1/2 md:block" aria-hidden>
              <XMark className="h-full w-full" />
            </div>
            <div className="relative z-[2] flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-7">
              <div className="flex items-center gap-5">
                <span className="sv-tile h-[72px] w-[72px] rounded-[20px]">
                  <Server className="h-9 w-9" />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-[var(--sv-a)]">
                    <span className="inline-block h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-[var(--sv-a)]" />
                    INFRASTRUCTURE
                  </p>
                  <h1 className="sv-display mt-1 text-[40px] font-bold leading-none tracking-tight text-[var(--sv-a)] [text-shadow:0_0_24px_rgba(var(--theme-rgb-500), .45)]">
                    Servers
                  </h1>
                  <p className="mt-2 text-sm text-[var(--text-muted-foreground)]">
                    {hasServers ? `${onlineCount} of ${servers.length} online · Manage and monitor your servers.` : "Manage and monitor your servers."}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-3">
                  <Link to="/admin?tab=manageserver" className="sv-btn">
                    <Settings className="h-4 w-4" />
                    Manage
                  </Link>
                  <Link to="/admin?tab=createserver" className="sv-btn primary">
                    <Plus className="h-4 w-4" />
                    New Server
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
            {error}
          </div>
        )}

        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
          aria-label="Servers"
        >
          {hasServers ? servers.map((server) => <ServerCard key={server.id} server={server} />) : <EmptyState isAdmin={isAdmin} />}
        </motion.section>
      </div>
    </div>
  );
}
