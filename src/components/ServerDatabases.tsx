import React, { useEffect, useState } from "react";
import axios from "axios";
import { Database, Plus, Trash2, RefreshCw, Copy, Check, Eye, EyeOff } from "lucide-react";
import { useNotification } from "../context/NotificationContext";

interface Db {
  id: string;
  displayName: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  host: string;
  port: number;
  createdAt: string;
}

export default function ServerDatabases({ serverId }: { serverId: string }) {
  const { notify } = useNotification();
  const [databases, setDatabases] = useState<Db[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchDatabases = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/servers/${serverId}/databases`);
      setDatabases(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDatabases(); }, [serverId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await axios.post(`/api/servers/${serverId}/databases`, { name: name.trim() });
      setName("");
      setShowCreate(false);
      await fetchDatabases();
    } catch (err: any) {
      notify(err.response?.data?.error || "Failed to create database.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this database? This cannot be undone.")) return;
    try {
      await axios.delete(`/api/servers/${serverId}/databases/${id}`);
      fetchDatabases();
    } catch (err: any) {
      notify(err.response?.data?.error || "Failed to delete database.");
    }
  };

  const copyValue = (val: string, field: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 text-foreground">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground-muted mb-1">Databases</h2>
            <p className="text-sm text-muted-foreground">Create and manage MySQL databases for this server.</p>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="w-full md:w-auto px-5 py-2.5 bg-theme-500 hover:bg-theme-600 border border-theme-400/50 text-foreground font-medium rounded-lg transition-all shadow-lg flex items-center justify-center shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" /> New Database
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-muted-subtle border border-border-subtle p-5 md:p-6 rounded-xl flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Database name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="app"
                className="w-full px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Letters, numbers, and underscores only.</p>
            </div>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="px-4 py-2 bg-theme-500 hover:bg-theme-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </form>
        )}

        <div className="bg-muted-subtle border border-border-subtle rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 flex justify-center">
              <RefreshCw className="w-6 h-6 text-theme-500 animate-spin" />
            </div>
          ) : databases.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <Database className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h4 className="text-foreground-muted font-medium mb-1">No databases yet</h4>
              <p className="text-muted-foreground text-sm">Create one above to get connection details.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {databases.map(db => (
                <div key={db.id} className="p-4 md:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-800 rounded-lg">
                        <Database className="w-5 h-5 text-foreground-muted" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{db.displayName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(db.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(db.id)}
                      className="p-2 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0"
                      title="Delete database"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    {[
                      { label: "Host", value: `${db.host}:${db.port}`, field: `${db.id}-host` },
                      { label: "Database", value: db.dbName, field: `${db.id}-name` },
                      { label: "Username", value: db.dbUser, field: `${db.id}-user` },
                    ].map(row => (
                      <div key={row.field} className="flex items-center justify-between gap-2 bg-muted px-3 py-2 rounded-lg">
                        <span className="text-muted-foreground truncate">{row.value}</span>
                        <button onClick={() => copyValue(row.value, row.field)} className="shrink-0 text-muted-foreground hover:text-foreground">
                          {copiedField === row.field ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 bg-muted px-3 py-2 rounded-lg">
                      <span className="text-muted-foreground truncate">{revealed[db.id] ? db.dbPassword : "••••••••••••"}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setRevealed(r => ({ ...r, [db.id]: !r[db.id] }))} className="text-muted-foreground hover:text-foreground">
                          {revealed[db.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => copyValue(db.dbPassword, `${db.id}-pass`)} className="text-muted-foreground hover:text-foreground">
                          {copiedField === `${db.id}-pass` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
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
