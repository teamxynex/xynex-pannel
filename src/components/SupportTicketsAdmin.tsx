import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { LifeBuoy, Send, Image as ImageIcon, X, CheckCircle2, UserCheck, Loader2, Bot, User as UserIcon, Shield } from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";

interface TicketMessage {
  id: string;
  sender: "user" | "ai" | "admin";
  senderName: string;
  text: string;
  image?: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  userId: string;
  username: string;
  status: "open" | "claimed" | "closed";
  claimedBy: string | null;
  claimedByName: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
}

export default function SupportTicketsAdmin() {
  const { notify } = useNotification();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [replyImage, setReplyImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = tickets.find((t) => t.id === selectedId) || null;

  const loadTickets = () => {
    axios.get("/api/support/tickets").then((res) => setTickets(res.data.tickets || []))
      .catch(() => notify("Failed to load support tickets.", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTickets();
    const token = localStorage.getItem("xynex_token");
    if (!token) return;
    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.on("support:new_ticket", (ticket: Ticket) => {
      setTickets((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)]);
    });
    socket.on("support:ticket_updated", (ticket: Ticket) => {
      setTickets((prev) => {
        const exists = prev.some((t) => t.id === ticket.id);
        const next = exists ? prev.map((t) => (t.id === ticket.id ? ticket : t)) : [ticket, ...prev];
        return next.filter((t) => t.status !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    });
    socket.on("support:message", ({ ticketId, message }: { ticketId: string; message: TicketMessage }) => {
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, messages: [...t.messages, message] } : t)));
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId || !socketRef.current) return;
    socketRef.current.emit("joinTicket", selectedId);
    return () => { socketRef.current?.emit("leaveTicket", selectedId); };
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [selected?.messages.length]);

  const handleAttach = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setReplyImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!selected || (!reply.trim() && !replyImage)) return;
    setSending(true);
    try {
      await axios.post(`/api/support/tickets/${selected.id}/messages`, { text: reply.trim(), image: replyImage || undefined });
      setReply("");
      setReplyImage(null);
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to send reply.", "error");
    } finally {
      setSending(false);
    }
  };

  const handleClaim = async (ticket: Ticket) => {
    try {
      await axios.post(`/api/support/tickets/${ticket.id}/claim`);
      notify("Ticket claimed.", "success");
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to claim ticket.", "error");
    }
  };

  const handleClose = async (ticket: Ticket) => {
    if (!confirm("Close this support ticket?")) return;
    try {
      await axios.post(`/api/support/tickets/${ticket.id}/close`);
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
      if (selectedId === ticket.id) setSelectedId(null);
      notify("Ticket closed.", "success");
    } catch (e: any) {
      notify(e.response?.data?.error || "Failed to close ticket.", "error");
    }
  };

  if (loading) {
    return <div className="text-muted-foreground animate-pulse">Loading support tickets...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 h-[70vh] min-h-[500px]">
      {/* Ticket list */}
      <div className="bg-muted-subtle border border-border-subtle rounded-2xl overflow-y-auto custom-scrollbar">
        {tickets.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <LifeBuoy className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No open tickets right now.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 rounded-xl transition-colors ${selectedId === t.id ? "bg-theme-500/15 border border-theme-500/40" : "hover:bg-muted border border-transparent"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-foreground truncate">{t.username}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${t.status === "open" ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                    {t.status === "open" ? "New" : `Claimed${t.claimedByName ? ` · ${t.claimedByName}` : ""}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{t.messages[t.messages.length - 1]?.text || "Screenshot"}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="bg-muted-subtle border border-border-subtle rounded-2xl flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a ticket to view the conversation.</div>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <div>
                <p className="font-bold text-foreground">{selected.username}</p>
                <p className="text-xs text-muted-foreground">{selected.status === "open" ? "Waiting for a staff member" : `Claimed by ${selected.claimedByName}`}</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "open" && (
                  <button onClick={() => handleClaim(selected)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-theme-500/10 hover:bg-theme-500/20 text-theme-400 rounded-lg transition-colors">
                    <UserCheck size={14} /> Claim
                  </button>
                )}
                <button onClick={() => handleClose(selected)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors">
                  <CheckCircle2 size={14} /> Close
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              {selected.messages.map((m) => {
                const isStaffMsg = m.sender === "admin";
                const Icon = m.sender === "ai" ? Bot : m.sender === "admin" ? Shield : UserIcon;
                return (
                  <div key={m.id} className={`flex ${isStaffMsg ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isStaffMsg ? "bg-theme-500 text-white" : "bg-black/40 text-foreground border border-border-subtle"}`}>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-70 mb-1">
                        <Icon size={11} /> {m.senderName}
                      </div>
                      {m.image && <img src={m.image} alt="screenshot" className="rounded-lg mb-2 max-h-56 object-contain" />}
                      {m.text && <p className="text-sm whitespace-pre-wrap">{m.text}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            {selected.status !== "closed" && (
              <div className="p-3 border-t border-border-subtle">
                {replyImage && (
                  <div className="relative inline-block mb-2">
                    <img src={replyImage} alt="attachment" className="h-16 rounded-lg border border-border" />
                    <button onClick={() => setReplyImage(null)} className="absolute -top-1.5 -right-1.5 bg-black rounded-full p-0.5 border border-border">
                      <X size={12} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleAttach(e.target.files[0])} />
                  <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-muted-foreground hover:text-foreground bg-black/30 rounded-xl transition-colors" title="Attach screenshot">
                    <ImageIcon size={16} />
                  </button>
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Reply to the user..."
                    className="flex-1 bg-black/30 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-theme-500/50 transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || (!reply.trim() && !replyImage)}
                    className="p-2.5 bg-theme-500 hover:bg-theme-400 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
