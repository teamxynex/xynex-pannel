import React from "react";
import { Server, LayoutDashboard, Settings, User } from "lucide-react";

export interface NavLink {
  name: string;
  path: string;
  icon: React.ReactNode;
}

export function getNavLinks(role?: string): NavLink[] {
  const links: NavLink[] = [
    { name: "Overview", path: "/", icon: <LayoutDashboard size={20} /> },
    { name: "Servers", path: "/servers", icon: <Server size={20} /> },
  ];
  if (role === "admin") {
    links.push({ name: "Admin Panel", path: "/admin", icon: <Settings size={20} /> });
    links.push({ name: "Settings", path: "/settings", icon: <User size={20} /> });
  } else {
    links.push({ name: "Settings", path: "/settings", icon: <Settings size={20} /> });
  }
  return links;
}

export function isLinkActive(pathname: string, link: NavLink): boolean {
  return pathname === link.path || (link.path !== "/" && link.path !== "/admin" && pathname.startsWith(link.path));
}
