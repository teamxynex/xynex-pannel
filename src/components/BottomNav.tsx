import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getNavLinks, isLinkActive } from "./navLinks";
import { motion } from "framer-motion";

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  const links = getNavLinks(user?.role);

  return (
    <div className="nx-head w-full flex-shrink-0 border-t border-b-0 border-t-[var(--nx-line-soft)] z-20 pb-safe">
      <nav className="flex items-stretch justify-around max-w-7xl mx-auto w-full">
        {links.map((link) => {
          const isActive = isLinkActive(location.pathname, link);
          return (
            <Link
              key={link.path}
              to={link.path}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors group overflow-hidden"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabBottomNav"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] bg-[var(--nx-a)] rounded-b-full shadow-[0_0_12px_var(--nx-a)]"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <div className={`relative z-10 transition-colors duration-200 ${isActive ? "text-[var(--nx-a)] drop-shadow-[0_0_6px_var(--nx-a)]" : "text-muted-foreground group-hover:text-foreground"}`}>
                {link.icon}
              </div>
              <span className={`relative z-10 font-semibold tracking-wide text-[10px] transition-colors duration-200 ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                {link.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
