import React, { useEffect, useState } from "react";
import axios from "axios";
import { Activity, RefreshCw, User } from "lucide-react";

interface Entry {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  description: string;
  ip: string | null;
}

export default function ServerActivity({ serverId }: { serverId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/servers/${serverId}/activity`);
      setEntries(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    const interval = setInterval(fetchEntries, 15000);
    return () => clearInterval(interval);
  }, [serverId]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 text-foreground">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <div>
          <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground-muted mb-1">Activity Log</h2>
          <p className="text-sm text-muted-foreground">Recent actions taken on this server.</p>
        </div>

        <div className="bg-muted-subtle border border-border-subtle rounded-xl overflow-hidden shadow-xl">
          {loading && entries.length === 0 ? (
            <div className="p-12 flex justify-center">
              <RefreshCw className="w-6 h-6 text-theme-500 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <Activity className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h4 className="text-foreground-muted font-medium mb-1">No activity yet</h4>
              <p className="text-muted-foreground text-sm">Actions on this server will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {entries.map(e => (
                <div key={e.id} className="p-4 flex items-start gap-3 hover:bg-muted-subtle transition-colors">
                  <div className="p-2 bg-zinc-800 rounded-lg shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-foreground-muted" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{e.username}</span> — {e.description}
                    </p>
                    <div className="flex flex-wrap items-center text-xs text-muted-foreground mt-1 gap-x-3 gap-y-0.5">
                      <span>{new Date(e.timestamp).toLocaleString()}</span>
                      <span>•</span>
                      <span className="font-mono">{e.action}</span>
                      {e.ip && <><span>•</span><span className="font-mono">{e.ip}</span></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
