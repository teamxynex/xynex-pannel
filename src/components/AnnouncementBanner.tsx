import { useState, useEffect } from "react";
import { Megaphone, X } from "lucide-react";
import { useSettings } from "../context/SettingsContext";

const colorClasses: Record<string, string> = {
  theme: "bg-theme-500/15 border-theme-500/30 text-theme-300",
  emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  amber: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  red: "bg-red-500/15 border-red-500/30 text-red-300",
};

export function AnnouncementBanner() {
  const { announcementEnabled, announcementText, announcementColor } = useSettings();
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(sessionStorage.getItem("dismissedAnnouncement"));
  }, []);

  if (!announcementEnabled || !announcementText) return null;
  if (dismissed === announcementText) return null;

  const colorClass = colorClasses[announcementColor] || colorClasses.theme;

  return (
    <div className={`w-full flex-shrink-0 border-b px-4 py-2.5 flex items-center gap-3 text-sm font-medium relative z-20 ${colorClass}`}>
      <Megaphone size={16} className="flex-shrink-0" />
      <span className="flex-1 min-w-0">{announcementText}</span>
      <button
        onClick={() => {
          sessionStorage.setItem("dismissedAnnouncement", announcementText);
          setDismissed(announcementText);
        }}
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        title="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
