import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Server, ChevronRight, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { ServerSummary } from "../../types/dashboard";

interface ServerCardProps {
  key?: React.Key;
  server: ServerSummary;
  onStatusChange?: () => void;
}

// Curated Steam header-art backgrounds for common game eggs, keyed off the
// egg/type/software label. Anything not recognized (e.g. Minecraft, which
// has no Steam app id) falls back to a plain gradient — no broken images.
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
];

function getGameBackground(server: ServerSummary): string | null {
  const label = `${server.eggName || ""} ${server.type || ""} ${server.software || ""}`.trim();
  if (!label) return null;
  const found = GAME_BACKGROUNDS.find((g) => g.match.test(label));
  return found ? `https://cdn.akamai.steamstatic.com/steam/apps/${found.appId}/header.jpg` : null;
}

interface LiveStats {
  cpu: number;
  ram: number;
  disk: number;
  limitRam: number;
  limitCpu: number;
  limitDisk: number;
}

// Lightweight live-stats poll scoped to this single card. Only runs while
// the server is online, matching the behavior of ServerLiveStats elsewhere.
function useServerStats(serverId: string, isOnline: boolean): LiveStats | null {
  const [statsData, setStatsData] = useState<LiveStats | null>(null);

  useEffect(() => {
    if (!isOnline) {
      setStatsData(null);
      return;
    }
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await axios.get(`/api/servers/${serverId}/stats`);
        if (!cancelled) setStatsData(res.data);
      } catch {
        /* keep last known value on transient errors */
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId, isOnline]);

  return statsData;
}

function StatChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/85">
      <span className="text-theme-300/90">{icon}</span>
      {value}
    </span>
  );
}

export function ServerCard({ server }: ServerCardProps) {
  const currentStatus = server.status;
  const isOnline = currentStatus === "online";
  const isStarting = currentStatus === "starting";
  const [imgFailed, setImgFailed] = useState(false);
  const bgImage = getGameBackground(server);
  const stats = useServerStats(server.id, isOnline);

  const ramLimitGb = server.memory ?? (stats ? +(stats.limitRam / 1024).toFixed(1) : undefined);
  const ramUsedGb = stats ? (stats.ram / 1024).toFixed(1) : null;
  const diskLimitGb = server.disk ?? stats?.limitDisk;
  const cpuPct = stats ? Math.round(stats.cpu) : null;
  const gameLabel = server.eggName || server.type || server.software;

  return (
    <Link
      to={`/servers/${server.id}`}
      className="group relative flex min-h-[196px] flex-col justify-end overflow-hidden rounded-2xl border border-border/80 shadow-lg backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-theme-500/40 hover:shadow-2xl hover:shadow-theme-500/10 cursor-pointer"
    >
      {/* Background layer: game art (when recognized) or a dark fallback */}
      <div className="absolute inset-0 bg-card">
        {bgImage && !imgFailed ? (
          <img
            src={bgImage}
            alt=""
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover object-center scale-[1.04] transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-theme-950 via-slate-950 to-black">
            <Server className="h-12 w-12 text-theme-500/15" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/65 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-4">
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              {isOnline && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  isOnline ? "bg-emerald-500" : isStarting ? "bg-amber-400" : "bg-rose-500"
                }`}
              />
            </span>
            <h3 className="truncate text-sm font-bold text-white drop-shadow-md">{server.name}</h3>
            <span className="shrink-0 font-mono text-[10px] text-white/50">{server.id.slice(0, 8)}</span>
          </div>
          {server.suspended && (
            <span className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
              Suspended
            </span>
          )}
        </div>

        <p className="mb-3 truncate font-mono text-[11px] text-white/60">
          {server.ipAlias || "—"}
          {server.port ? `:${server.port}` : ""}
          {server.node ? <span className="text-white/40"> on {server.node}</span> : null}
          {gameLabel ? <span className="text-white/40"> · {gameLabel}</span> : null}
        </p>

        <div className="flex items-center gap-3 border-t border-white/10 pt-3">
          <StatChip icon={<Cpu className="h-3 w-3" />} value={cpuPct !== null ? `${cpuPct}%` : "--%"} />
          <StatChip
            icon={<MemoryStick className="h-3 w-3" />}
            value={ramUsedGb !== null ? `${ramUsedGb}/${ramLimitGb ?? "--"}GB` : `${ramLimitGb ?? "--"}GB`}
          />
          <StatChip icon={<HardDrive className="h-3 w-3" />} value={diskLimitGb !== undefined ? `${diskLimitGb}GB` : "--GB"} />
          <div className="ml-auto flex items-center gap-1 text-[11px] font-medium text-white/50 transition-colors group-hover:text-theme-300">
            <span className="hidden sm:inline">Open</span>
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
