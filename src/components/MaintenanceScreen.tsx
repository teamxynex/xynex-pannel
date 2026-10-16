import { Wrench, Server, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface MaintenanceScreenProps {
  message?: string;
  panelName?: string;
  panelLogo?: string;
}

// Shown in place of the whole panel for non-admin users while maintenance
// mode is on (Admin Panel -> General -> Maintenance Mode). Admins/owners
// always bypass this so they can keep working and flip it back off.
export function MaintenanceScreen({ message, panelName, panelLogo }: MaintenanceScreenProps) {
  const { logout } = useAuth();

  return (
    <div className="h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-sans px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          {panelLogo ? (
            <img src={panelLogo} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-theme-600 text-white">
              <Server className="w-4 h-4" />
            </div>
          )}
          <span className="text-lg font-bold">{panelName || "Panel"}</span>
        </div>

        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Wrench className="w-7 h-7 text-amber-400" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-3">Under Maintenance</h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          {message || "We're performing scheduled maintenance. Please check back shortly."}
        </p>

        <button
          onClick={logout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </div>
  );
}
