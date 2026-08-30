import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { BottomNav } from "./BottomNav";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { Menu, ChevronRight, LogOut, Server } from "lucide-react";
import { useLocation, matchPath, Link } from "react-router-dom";
import GlobalSearchModal from "./GlobalSearchModal";
import NotificationsDropdown from "./NotificationsDropdown";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const { navLayout, panelName, panelLogo } = useSettings();
  const { user, logout } = useAuth();

  const isServerView = matchPath("/servers/:id/*", location.pathname) && !matchPath("/servers/create", location.pathname);
  const isAdminPanel = location.pathname === "/admin";

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    if (path === '/servers') return 'Servers';
    if (path === '/servers/create') return 'Deploy Server';
    if (path.startsWith('/servers/')) return 'Server Management';
    if (path === '/admin/servers') return 'Fleet';
    if (path === '/settings') return 'Settings';
    if (path === '/api-keys') return 'API Keys';
    return '';
  };

  if (isServerView || isAdminPanel) {
    return (
      <div className="flex flex-col h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-theme-500/30">
        <AnnouncementBanner />
        <div className="flex flex-1 w-full min-h-0">
          <main className="flex-1 w-full h-full relative z-10 overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    );
  }

  if (navLayout === "top") {
    return (
      <div className="flex flex-col h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-theme-500/30">
        <TopNav />
        <AnnouncementBanner />
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative bg-transparent">
          <main className="flex-1 w-full h-full relative z-0 overflow-x-hidden overflow-y-auto pb-safe custom-scrollbar">
            <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (navLayout === "bottom") {
    return (
      <div className="flex flex-col h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-theme-500/30">
        <header className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-card/80 backdrop-blur-xl border-b border-border-subtle relative z-10 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {panelLogo ? (
              <img src={panelLogo} alt="Logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-theme-600 shadow-sm flex-shrink-0 text-white">
                <Server className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0 hidden sm:flex flex-col leading-tight">
              <h1 className="text-sm font-bold text-foreground tracking-tight truncate">{panelName}</h1>
              <span className="text-xs text-muted-foreground truncate">{getBreadcrumb()}</span>
            </div>
            <span className="text-sm font-medium text-foreground sm:hidden truncate">{getBreadcrumb()}</span>
          </div>
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
        </header>
        <AnnouncementBanner />
        <main className="flex-1 w-full h-full relative z-0 overflow-x-hidden overflow-y-auto pb-safe custom-scrollbar">
          <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] w-full bg-transparent text-foreground font-sans overflow-hidden selection:bg-theme-500/30`}>
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      
      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 z-50 transform flex-shrink-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <Sidebar onClose={() => setMobileOpen(false)} isCollapsed={isCollapsed} toggleCollapse={() => setIsCollapsed(!isCollapsed)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative bg-transparent">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-card/80 backdrop-blur-xl border-b border-border-subtle relative z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
              <Menu size={20} />
            </button>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="hidden md:flex p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="text-foreground">{getBreadcrumb()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <GlobalSearchModal />
            <NotificationsDropdown />
          </div>
        </header>
        <AnnouncementBanner />

        {/* Main Content */}
        <main className={`flex-1 w-full h-full relative z-0 overflow-x-hidden overflow-y-auto pb-safe custom-scrollbar`}>
          <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
