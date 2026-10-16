import React, { useEffect, useState } from "react";
import axios from "axios";
import { Clock, Plus, Trash2, RefreshCw, Play, Power, Terminal as TerminalIcon, ToggleLeft, ToggleRight } from "lucide-react";
import { useNotification } from "../context/NotificationContext";

interface Interval {
  type: "minutes" | "hourly" | "daily" | "weekly";
  value?: number;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
}

interface ScheduleItem {
  id: string;
  name: string;
  action: "start" | "stop" | "restart" | "command";
  command: string | null;
  interval: Interval;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeInterval(i: Interval) {
  if (i.type === "minutes") return `Every ${i.value || 5} minute(s)`;
  if (i.type === "hourly") return `Every hour at :${String(i.minute || 0).padStart(2, "0")}`;
  if (i.type === "daily") return `Daily at ${String(i.hour || 0).padStart(2, "0")}:${String(i.minute || 0).padStart(2, "0")}`;
  if (i.type === "weekly") return `Every ${DAYS[i.dayOfWeek || 0]} at ${String(i.hour || 0).padStart(2, "0")}:${String(i.minute || 0).padStart(2, "0")}`;
  return "";
}

const actionIcon: Record<string, any> = { start: Power, stop: Power, restart: RefreshCw, command: TerminalIcon };

export default function ServerSchedules({ serverId }: { serverId: string }) {
  const { notify } = useNotification();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [action, setAction] = useState<"start" | "stop" | "restart" | "command">("restart");
  const [command, setCommand] = useState("");
  const [intervalType, setIntervalType] = useState<Interval["type"]>("daily");
  const [minutesValue, setMinutesValue] = useState(30);
  const [hour, setHour] = useState(4);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(0);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/servers/${serverId}/schedules`);
      setSchedules(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedules(); }, [serverId]);

  const buildInterval = (): Interval => {
    if (intervalType === "minutes") return { type: "minutes", value: minutesValue };
    if (intervalType === "hourly") return { type: "hourly", minute };
    if (intervalType === "weekly") return { type: "weekly", hour, minute, dayOfWeek };
    return { type: "daily", hour, minute };
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await axios.post(`/api/servers/${serverId}/schedules`, {
        name: name.trim(),
        action,
        command: action === "command" ? command : undefined,
        interval: buildInterval(),
      });
      setShowCreate(false);
      setName(""); setCommand("");
      await fetchSchedules();
    } catch (err: any) {
      notify(err.response?.data?.error || "Failed to create schedule.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (s: ScheduleItem) => {
    try {
      await axios.put(`/api/servers/${serverId}/schedules/${s.id}`, { enabled: !s.enabled });
      fetchSchedules();
    } catch (err: any) {
      notify(err.response?.data?.error || "Failed to update schedule.");
    }
  };

  const handleRunNow = async (s: ScheduleItem) => {
    try {
      await axios.post(`/api/servers/${serverId}/schedules/${s.id}/run`);
      notify(`"${s.name}" executed.`);
      fetchSchedules();
    } catch (err: any) {
      notify(err.response?.data?.error || "Failed to run schedule.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await axios.delete(`/api/servers/${serverId}/schedules/${id}`);
      fetchSchedules();
    } catch (err: any) {
      notify(err.response?.data?.error || "Failed to delete schedule.");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 text-foreground">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground-muted mb-1">Schedules</h2>
            <p className="text-sm text-muted-foreground">Automate power actions or console commands on a recurring interval.</p>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="w-full md:w-auto px-5 py-2.5 bg-theme-500 hover:bg-theme-600 border border-theme-400/50 text-foreground font-medium rounded-lg transition-all shadow-lg flex items-center justify-center shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" /> New Schedule
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-muted-subtle border border-border-subtle p-5 md:p-6 rounded-xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Nightly restart"
                  className="w-full px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Action</label>
                <select value={action} onChange={e => setAction(e.target.value as any)}
                  className="w-full px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50">
                  <option value="start">Start server</option>
                  <option value="stop">Stop server</option>
                  <option value="restart">Restart server</option>
                  <option value="command">Send console command</option>
                </select>
              </div>
            </div>

            {action === "command" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Command</label>
                <input value={command} onChange={e => setCommand(e.target.value)} placeholder="say Restarting soon"
                  className="w-full px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50" />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repeats</label>
              <select value={intervalType} onChange={e => setIntervalType(e.target.value as any)}
                className="w-full md:w-56 px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50">
                <option value="minutes">Every N minutes</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              {intervalType === "minutes" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Every</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={minutesValue} onChange={e => setMinutesValue(Number(e.target.value))}
                      className="w-24 px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50" />
                    <span className="text-sm text-muted-foreground">minutes</span>
                  </div>
                </div>
              )}
              {intervalType === "weekly" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Day</label>
                  <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))}
                    className="px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50">
                    {DAYS.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                  </select>
                </div>
              )}
              {(intervalType === "daily" || intervalType === "weekly") && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hour</label>
                  <input type="number" min={0} max={23} value={hour} onChange={e => setHour(Number(e.target.value))}
                    className="w-20 px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50" />
                </div>
              )}
              {intervalType !== "minutes" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Minute</label>
                  <input type="number" min={0} max={59} value={minute} onChange={e => setMinute(Number(e.target.value))}
                    className="w-20 px-3 py-2 bg-muted border border-border-subtle rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-theme-500/50" />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={creating || !name.trim() || (action === "command" && !command.trim())}
              className="px-4 py-2 bg-theme-500 hover:bg-theme-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Schedule
            </button>
          </form>
        )}

        <div className="bg-muted-subtle border border-border-subtle rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 flex justify-center">
              <RefreshCw className="w-6 h-6 text-theme-500 animate-spin" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <Clock className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h4 className="text-foreground-muted font-medium mb-1">No schedules yet</h4>
              <p className="text-muted-foreground text-sm">Create one above to automate this server.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {schedules.map(s => {
                const Icon = actionIcon[s.action] || Clock;
                return (
                  <div key={s.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted-subtle transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-800 rounded-lg">
                        <Icon className="w-5 h-5 text-foreground-muted" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{s.name}</p>
                        <div className="flex flex-wrap items-center text-xs text-muted-foreground mt-1 gap-x-3 gap-y-0.5">
                          <span>{describeInterval(s.interval)}</span>
                          <span>•</span>
                          <span className="capitalize">{s.action}{s.action === "command" ? `: ${s.command}` : ""}</span>
                          {s.lastRunAt && <><span>•</span><span>Last run {new Date(s.lastRunAt).toLocaleString()}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <button onClick={() => handleToggle(s)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title={s.enabled ? "Disable" : "Enable"}>
                        {s.enabled ? <ToggleRight className="w-6 h-6 text-theme-400" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                      <button onClick={() => handleRunNow(s)} className="flex-1 md:flex-none flex justify-center items-center px-3 py-1.5 bg-muted hover:bg-muted-hover text-foreground text-xs font-medium rounded transition-colors">
                        <Play className="w-3.5 h-3.5 mr-1.5" /> Run Now
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 text-muted-foreground bg-muted border border-transparent hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
