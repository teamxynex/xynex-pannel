// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ServerList · Fleet grid with live status and per-server metrics           ║
// ║                                                                            ║
// ║  STEP 1 · Imports          STEP 5 · Primitives (StatusBadge, Metric)       ║
// ║  STEP 2 · Types            STEP 6 · ServerCard                             ║
// ║  STEP 3 · Constants        STEP 7 · Sections (Loading, Empty)             ║
// ║  STEP 4 · Data hook        STEP 8 · Page composition                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/* ── STEP 1 · Imports ─────────────────────────────────────────────────────── */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { Server, Plus, ChevronRight, Settings, Lock, Terminal, FileCode2, Coffee, Gamepad2 } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import ServerLiveStats from "../components/ServerLiveStats";

/* ── STEP 2 · Types ───────────────────────────────────────────────────────── */
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

/* ── STEP 3 · Constants ───────────────────────────────────────────────────── */
const EASE = [0.22, 1, 0.36, 1] as const;
const POLL_INTERVAL_MS = 5_000;
const DEFAULT_CPU = 100;
const DEFAULT_DISK = 10;
const SURFACE = "transparent"; // Changed to transparent so global background shows

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.03 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

const isOnline = (status?: ServerStatus): boolean => status === "online";

/* ── STEP 4 · Data hook (fetch + poll) ────────────────────────────────────── */
/** Fetches the server fleet and re-polls on a fixed interval with cleanup. */
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
    const interval = window.setInterval(
      () => void fetchServers(controller.signal),
      pollIntervalMs,
    );
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [fetchServers, pollIntervalMs]);

  return { servers, error, isLoading };
}

/* ── STEP 5 · Primitives ──────────────────────────────────────────────────── */
const StatusBadge = memo(function StatusBadge({
  status,
}: {
  status?: ServerStatus;
}) {
  const online = isOnline(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
        online
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
          : "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
      }`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80 motion-reduce:hidden" />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
            online ? "bg-emerald-400" : "bg-zinc-500"
          }`}
        />
      </span>
      {online ? "Online" : "Offline"}
    </span>
  );
});

/** Labeled metric cell used inside a server card. */
function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="font-mono text-sm font-semibold text-foreground">
        {children}
      </div>
    </div>
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

/* ── STEP 6 · ServerCard ──────────────────────────────────────────────────── */
const ServerCard = memo(function ServerCard({
  server,
}: {
  server: ServerRecord;
}) {
  const online = isOnline(server.status);
  const isSuspended = server.suspended;
  const banner = useMemo(() => getServerBanner(server), [server.eggName, server.type, server.software]);
  const [bannerFailed, setBannerFailed] = useState(false);

  const content = (
    <>
      {/* 6.1 · Status edge-light */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-px ${
          online
            ? "bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
            : "bg-gradient-to-r from-transparent via-white/15 to-transparent"
        }`}
      />
      {/* 6.2 · Banner (game art or language card) */}
      <div className="relative h-24 w-full shrink-0 overflow-hidden">
        {banner.kind === "image" && banner.image && !bannerFailed ? (
          <img
            src={banner.image}
            alt=""
            onError={() => setBannerFailed(true)}
            className="h-full w-full object-cover object-center scale-[1.04] transition-transform duration-500 ease-out group-hover:scale-110"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center gap-2 bg-gradient-to-br ${banner.gradient}`}>
            <span className="text-white/80">{banner.icon}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        {!isSuspended && (
          <ChevronRight className="absolute right-3 top-3 h-4 w-4 shrink-0 text-white/70 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
        )}
      </div>
      {/* 6.3 · Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
            {server.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={server.status} />
            {isSuspended && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-400 uppercase">
                <Lock className="h-3 w-3" />
                Suspended
              </span>
            )}
          </div>
        </div>
        {/* 6.4 · Metrics */}
        <div className="mt-5 grid flex-1 grid-cols-1 gap-2.5 rounded-xl border border-border-subtle bg-muted px-3.5 py-3.5">
          <Metric label="CPU Limit">
            {server.cpu ?? DEFAULT_CPU}
            <span className="ml-0.5 text-muted-foreground">%</span>
          </Metric>
          <Metric label="RAM Usage">
            <ServerLiveStats
              serverId={server.id}
              limitRam={server.ram}
              status={server.status}
            />
          </Metric>
          <Metric label="Disk Limit">
            {server.disk ?? DEFAULT_DISK}
            <span className="ml-0.5 text-muted-foreground">GB</span>
          </Metric>
          <Metric label="Version">
            <span className="block truncate" title={server.version}>
              {server.version ?? "—"}
            </span>
          </Metric>
        </div>
      </div>
    </>
  );

  return (
    <motion.article variants={itemVariants} className="h-full">
      {isSuspended ? (
        <div className="group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-red-500/10 bg-black/40 dark:bg-black/40 opacity-75 cursor-not-allowed">
          {content}
        </div>
      ) : (
        <Link
          to={`/servers/${server.id}`}
          className="group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-muted-subtle transition-colors duration-200 hover:border-border-strong hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          {content}
        </Link>
      )}
    </motion.article>
  );
});

/* ── STEP 7 · Sections ────────────────────────────────────────────────────── */
function LoadingState() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4"
      style={{ backgroundColor: SURFACE }}
    >
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-white/70"
        aria-hidden
      />
      <p className="text-sm font-medium text-muted-foreground">Loading instances…</p>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <motion.div
      variants={itemVariants}
      className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted-subtle px-6 py-24 text-center"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted">
        <Server className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        No instances running
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        You haven&apos;t deployed any servers yet. Create one to start managing
        your game instances.
      </p>
      {isAdmin && (
        <Link
          to="/admin?tab=createserver"
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--btn-primary-bg)] px-4 text-sm font-semibold text-[var(--btn-primary-text)] transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070708]"
        >
          <Plus className="h-4 w-4" />
          Create your first server
        </Link>
      )}
    </motion.div>
  );
}

/* ── STEP 8 · Page composition ────────────────────────────────────────────── */
export default function ServerList() {
  const { user } = useAuth();
  const { servers, error, isLoading } = useServers();

  // 8.1 · Gating — resolve auth BEFORE making any role decision.
  //        `user` is undefined while auth is still restoring; null when logged
  //        out; an object once resolved. Gating on this prevents admin controls
  //        from flickering in/out on first paint.
  //        If your AuthContext exposes an explicit flag instead (e.g. `loading`
  //        or `isReady`), swap the line below for: const isAuthReady = !loading;
  const isAuthReady = user !== undefined;
  const isAdmin = isAuthReady && user?.role === "admin";
  const hasServers = servers.length > 0;

  // 8.2 · Live "X of Y online" summary.
  const onlineCount = useMemo(
    () => servers.reduce((n, s) => n + (isOnline(s.status) ? 1 : 0), 0),
    [servers],
  );

  // 8.3 · First paint: wait for auth readiness AND the initial data load.
  if (!isAuthReady || (isLoading && !hasServers)) return <LoadingState />;

  // 8.4 · Full page.
  return (
    <div
      className="relative min-h-screen text-foreground"
      style={{ backgroundColor: SURFACE }}
    >
      <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
        {/* 8.4a · Header */}
        <header className="mb-8 flex flex-col gap-4 border-b border-border-subtle pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Infrastructure
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Instances
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasServers
                ? `${onlineCount} of ${servers.length} online · Manage and monitor your fleet.`
                : "Manage and monitor your server fleet."}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Link
                to="/admin?tab=manageserver"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070708]"
              >
                <Settings className="h-4 w-4" />
                Manage
              </Link>
              <Link
                to="/admin?tab=createserver"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--btn-primary-bg)] px-4 text-sm font-semibold text-[var(--btn-primary-text)] transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070708]"
              >
                <Plus className="h-4 w-4" />
                New Instance
              </Link>
            </div>
          )}
        </header>

        {/* 8.4b · Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm font-medium text-red-300"
          >
            {error}
          </div>
        )}

        {/* 8.4c · Fleet */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          aria-label="Server instances"
        >
          {hasServers ? (
            servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))
          ) : (
            <EmptyState isAdmin={isAdmin} />
          )}
        </motion.section>
      </div>
    </div>
  );
}
