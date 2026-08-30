import { Link, useLocation } from "react-router-dom";
import { LogOut, Server } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { motion } from "framer-motion";
import { getNavLinks, isLinkActive } from "./navLinks";
import GlobalSearchModal from "./GlobalSearchModal";
import NotificationsDropdown from "./NotificationsDropdown";

export function TopNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { panelName, panelLogo } = useSettings();
  const links = getNavLinks(user?.role);

  return (
    <div className="w-full flex-shrink-0 bg-card/80 backdrop-blur-xl border-b border-border z-20">
      <div className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3 flex-shrink-0">
          {panelLogo ? (
            <img src={panelLogo} alt="Logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-theme-600 shadow-sm flex-shrink-0 text-white">
              <Server className="w-4 h-4" />
            </div>
          )}
          <h1 className="text-lg font-bold text-foreground tracking-tight truncate whitespace-nowrap hidden sm:block">
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
                className="relative flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group overflow-hidden whitespace-nowrap"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabTopNav"
                    className="absolute inset-0 bg-muted-hover rounded-lg"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className={`relative z-10 transition-colors duration-200 ${isActive ? "text-theme-600 dark:text-theme-400" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {link.icon}
                </div>
                <span className={`relative z-10 font-medium text-sm transition-colors duration-200 hidden md:inline ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {link.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <GlobalSearchModal />
          <NotificationsDropdown />
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-theme-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0 overflow-hidden">
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
