import { Link, useLocation } from "react-router-dom";
import { LogOut, Server } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { getNavLinks, isLinkActive } from "./navLinks";
import GlobalSearchModal from "./GlobalSearchModal";
import NotificationsDropdown from "./NotificationsDropdown";

export function TopNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { panelName, panelLogo } = useSettings();
  const links = getNavLinks(user?.role);

  return (
    <div className="nx-head w-full flex-shrink-0 z-20">
      <div className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3 flex-shrink-0">
          {panelLogo ? (
            <img src={panelLogo} alt="Logo" className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-[var(--nx-line)]" />
          ) : (
            <div className="nx-tile w-9 h-9 rounded-xl">
              <Server className="w-4 h-4" />
            </div>
          )}
          <h1 className="nx-display text-lg font-extrabold text-foreground tracking-tight truncate whitespace-nowrap hidden sm:block">
            {panelName}
          </h1>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {links.map((link) => {
            const isActive = isLinkActive(location.pathname, link);
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`nx-navitem group gap-2 px-3 py-2 whitespace-nowrap ${isActive ? "active" : ""}`}
              >
                <div className={`nx-ico relative z-10 transition-colors duration-200 ${isActive ? "" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {link.icon}
                </div>
                <span className={`relative z-10 font-semibold tracking-wide text-sm transition-colors duration-200 hidden md:inline ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {link.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <GlobalSearchModal />
          <NotificationsDropdown />
          <div className="nx-avatar w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0 overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt={user?.username} className="w-full h-full object-cover" />
            ) : (
              user?.username?.[0]?.toUpperCase()
            )}
          </div>
          <button onClick={logout} className="p-2 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
