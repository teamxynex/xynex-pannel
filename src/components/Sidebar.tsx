import { Link, useLocation } from "react-router-dom";
import { LogOut, X, Server } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { motion } from "framer-motion";
import { getNavLinks, isLinkActive } from "./navLinks";

export function Sidebar({ onClose, isCollapsed, toggleCollapse }: { onClose?: () => void, isCollapsed?: boolean, toggleCollapse?: () => void }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { panelName, panelLogo } = useSettings();

  const links = getNavLinks(user?.role);

  return (
    <div className={`nx-side transition-all duration-300 z-20 ${isCollapsed ? "w-[84px]" : "w-64"}`}>
      {/* Brand */}
      <div className={`h-[68px] flex items-center border-b border-[var(--nx-line-soft)] ${isCollapsed ? "justify-center" : "px-5"} flex-shrink-0 relative`}>
        {onClose && (
          <button onClick={onClose} className="md:hidden flex items-center justify-center absolute top-5 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" aria-label="Close menu">
            <X size={20} />
          </button>
        )}
        <div className="flex items-center gap-3 min-w-0">
          {panelLogo ? (
            <img src={panelLogo} alt="Logo" className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-[var(--nx-line)]" />
          ) : (
            <span className="nx-tile h-10 w-10 rounded-xl">
              <Server className="w-5 h-5" />
            </span>
          )}
          {!isCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 leading-tight">
              <h1 className="nx-display text-[17px] font-extrabold text-foreground tracking-tight truncate whitespace-nowrap">{panelName}</h1>
              <p className="nx-eyebrow !text-[9px] !tracking-[0.2em] mt-0.5">Control Panel</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 w-full px-3 py-5 space-y-1.5 overflow-y-auto custom-scrollbar">
        {!isCollapsed && <p className="nx-eyebrow px-3 mb-3 !text-[10px]">Navigation</p>}
        {links.map((link) => {
          const isActive = isLinkActive(location.pathname, link);
          return (
            <Link
              key={link.path}
              to={link.path}
              onClick={onClose}
              title={isCollapsed ? link.name : undefined}
              className={`nx-navitem group ${isActive ? "active" : ""} ${isCollapsed ? "justify-center h-12" : "px-3 py-3"}`}
            >
              {isActive && <span className="nx-navbar" />}
              <span className={`nx-ico relative z-10 transition-colors duration-200 ${isActive ? "" : "text-muted-foreground group-hover:text-foreground"}`}>
                {link.icon}
              </span>
              {!isCollapsed && (
                <span className={`ml-3 relative z-10 font-semibold text-sm tracking-wide transition-colors duration-200 ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                  {link.name}
                </span>
              )}
              {isActive && !isCollapsed && <span className="nx-pulse ml-auto h-1.5 w-1.5 rounded-full bg-[var(--nx-a)] shadow-[0_0_8px_var(--nx-a)]" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="w-full p-3 mt-auto">
        {isCollapsed ? (
          <button onClick={logout} title="Logout" className="flex items-center justify-center w-full h-11 rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors">
            <LogOut size={20} />
          </button>
        ) : (
          <div className="nx-frame sm">
            <div className="nx-frame-in flex flex-nowrap items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className="nx-avatar w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user?.username} className="w-full h-full object-cover" />
                  ) : (
                    user?.username?.[0]?.toUpperCase()
                  )}
                </div>
                <div className="truncate min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{user?.username}</p>
                  <p className="text-[11px] text-[var(--nx-a)] uppercase tracking-widest truncate flex items-center gap-1.5">
                    <span className="nx-pulse h-1.5 w-1.5 rounded-full bg-[var(--nx-a)]" /> {user?.role || "User"}
                  </p>
                </div>
              </div>
              <button onClick={logout} title="Logout" className="p-2 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors flex-shrink-0 self-center">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
