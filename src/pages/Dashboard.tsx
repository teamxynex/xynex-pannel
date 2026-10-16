import React from "react";
import { AlertTriangle, RefreshCw, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useDashboardData } from "../hooks/useDashboardData";
import { AmbientBackground } from "../components/dashboard/AmbientBackground";
import { PremiumLoader } from "../components/dashboard/PremiumLoader";
import { PrimaryButton } from "../components/dashboard/Shared";
import {
  HeroBanner, StatTiles, MyServers, PerformanceChart, RecentActivity,
  QuickActions, ServerStatusList, SystemOverview, HelpStrip,
} from "../components/dashboard/DashboardPanels";

export default function Dashboard() {
  const { user } = useAuth();
  const { panelName, panelLogo } = useSettings();
  const { stats, servers, state, history, refetch } = useDashboardData();
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  return (
    <>
      <AmbientBackground />

      {state === "loading" && !stats && servers.length === 0 ? (
        <PremiumLoader />
      ) : state === "error" && !stats && servers.length === 0 ? (
        <div className="relative z-10 mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 backdrop-blur-xl">
            <AlertTriangle className="h-8 w-8 text-rose-400" />
          </div>
          <h2 className="nx-display mb-2 text-xl font-bold text-foreground">API Connection Lost</h2>
          <p className="mb-6 text-sm text-muted-foreground">Unable to reach the dashboard services. Please check your network.</p>
          <PrimaryButton onClick={refetch}>
            <RefreshCw className="h-4 w-4" /> Retry Connection
          </PrimaryButton>
        </div>
      ) : (
        <div className="relative z-10 grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column */}
          <div className="min-w-0 space-y-4">
            <HeroBanner
              username={user?.username || "Commander"}
              panelName={panelName}
              panelLogo={panelLogo}
              action={
                isAdmin ? (
                  <Link
                    to="/admin?tab=createserver"
                    className="nx-btn primary"
                  >
                    <Plus className="h-4 w-4" /> Create Server
                  </Link>
                ) : undefined
              }
            />
            <StatTiles stats={stats} servers={servers} />
            <MyServers servers={servers} canCreate={isAdmin} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <PerformanceChart history={history} />
              <RecentActivity servers={servers} />
            </div>
          </div>

          {/* Right rail */}
          <aside className="min-w-0 space-y-4">
            <QuickActions servers={servers} onChanged={refetch} />
            <ServerStatusList servers={servers} />
            <SystemOverview stats={stats} servers={servers} />
          </aside>

          <div className="xl:col-span-2">
            <HelpStrip />
          </div>
        </div>
      )}
    </>
  );
}
