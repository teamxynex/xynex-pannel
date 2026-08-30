import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Send, Image as ImageIcon, Loader2, Bot, User as UserIcon, Shield, UserCheck2, Sparkles } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";

interface DisplayMessage {
  id: string;
  sender: "user" | "ai" | "admin";
  senderName: string;
  text: string;
  image?: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  status: "open" | "claimed" | "closed";
  claimedByName: string | null;
  messages: DisplayMessage[];
}

export default function SupportWidget() {
  const { aiSupportEnabled, aiSupportName, aiSupportLogo } = useSettings();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [mode, setMode] = useState<"ai" | "ticket">("ai");
  const [aiMessages, setAiMessages] = useState<DisplayMessage[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [text, setText] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const joinedTicketRef = useRef<string | null>(null);

  const name = aiSupportName || "Support";

  useEffect(() => {
    if (!user || !aiSupportEnabled) return;

    axios.get("/api/support/ticket").then((res) => {
      if (res.data.ticket) {
        setTicket(res.data.ticket);
        setMode("ticket");
      }
    }).catch(() => {});

    const token = localStorage.getItem("xynex_token");
    if (!token) return;
    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.on("support:message", ({ ticketId, message }: { ticketId: string; message: DisplayMessage }) => {
      setTicket((prev) => {
        if (!prev || prev.id !== ticketId) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
      if (message.sender === "admin") setUnread((u) => !open || u);
    });
    socket.on("support:ticket_updated", (t: Ticket) => {
      setTicket((prev) => (prev && prev.id === t.id ? { ...prev, status: t.status, claimedByName: t.claimedByName } : prev));
    });
    socket.on("support:ticket_closed", ({ ticketId }: { ticketId: string }) => {
      setTicket((prev) => (prev && prev.id === ticketId ? null : prev));
      setMode("ai");
      setAiMessages([]);
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, aiSupportEnabled]);

  useEffect(() => {
    if (!ticket || !socketRef.current) return;
    if (joinedTicketRef.current === ticket.id) return;
    if (joinedTicketRef.current) socketRef.current.emit("leaveTicket", joinedTicketRef.current);
    socketRef.current.emit("joinTicket", ticket.id);
    joinedTicketRef.current = ticket.id;
  }, [ticket?.id]);

  useEffect(() => {
    if (open) setUnread(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [open, ticket?.messages.length, aiMessages.length]);

  if (!user || !aiSupportEnabled) return null;

  const messages = mode === "ticket" && ticket ? ticket.messages : aiMessages;

  const handleAttach = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!text.trim() && !attachedImage) return;
    const outgoingText = text.trim();
    const outgoingImage = attachedImage || undefined;
    setText("");
    setAttachedImage(null);
    setSending(true);

    if (mode === "ticket" && ticket) {
      try {
        await axios.post(`/api/support/tickets/${ticket.id}/messages`, { text: outgoingText, image: outgoingImage });
      } catch (e) {
        // best-effort; the ticket panel doesn't have a great inline error slot, keep it simple
      } finally {
        setSending(false);
      }
      return;
    }

    const userMsg: DisplayMessage = { id: `local-${Date.now()}`, sender: "user", senderName: user.username, text: outgoingText, image: outgoingImage, createdAt: new Date().toISOString() };
    const nextMessages = [...aiMessages, userMsg];
    setAiMessages(nextMessages);

    try {
      const history = nextMessages
        .filter((m) => m.sender !== undefined)
        .map((m) => ({ role: m.sender === "ai" ? "assistant" as const : "user" as const, text: m.text }))
        .slice(0, -1);
      const res = await axios.post("/api/support/ai-chat", { message: outgoingText, image: outgoingImage, history });
      const aiMsg: DisplayMessage = { id: `local-${Date.now()}-ai`, sender: "ai", senderName: name, text: res.data.reply, createdAt: new Date().toISOString() };
      setAiMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      const errMsg: DisplayMessage = {
        id: `local-${Date.now()}-err`,
        sender: "ai",
        senderName: name,
        text: e.response?.data?.error || "Sorry, I couldn't reach the AI assistant. You can tap \"Talk to a human\" below.",
        createdAt: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleEscalate = async () => {
    setEscalating(true);
    try {
      const res = await axios.post("/api/support/ticket", {
        messages: aiMessages.map((m) => ({ sender: m.sender === "ai" ? "ai" : "user", text: m.text, image: m.image })),
      });
      setTicket(res.data.ticket);
      setMode("ticket");
    } catch (e) {
      // ignore
    } finally {
      setEscalating(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-5 z-[60] w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-[#0a0a0d] border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle bg-black/40 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-theme-500/15 flex items-center justify-center shrink-0">
                  {aiSupportLogo ? <img src={aiSupportLogo} alt="" className="w-full h-full object-cover" /> : <Sparkles className="w-4 h-4 text-theme-400" />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {mode === "ticket" && ticket
                      ? ticket.status === "open" ? "Waiting for a staff member" : `Chatting with ${ticket.claimedByName}`
                      : "AI assistant · online"}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8 px-4">
                  Ask me anything about your servers, worlds, plugins, or account — you can also attach a screenshot.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender === "user";
                  const Icon = m.sender === "ai" ? Bot : m.sender === "admin" ? Shield : UserIcon;
                  return (
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isMe ? "bg-theme-500 text-white" : "bg-muted text-foreground border border-border-subtle"}`}>
                        {!isMe && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-70 mb-1">
                            <Icon size={11} /> {m.senderName}
                          </div>
                        )}
                        {m.image && <img src={m.image} alt="screenshot" className="rounded-lg mb-2 max-h-48 object-contain" />}
                        {m.text && <p className="text-sm whitespace-pre-wrap leading-snug">{m.text}</p>}
                      </div>
                    </div>
                  );
                })
              )}
              {sending && mode === "ai" && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border-subtle rounded-2xl px-3.5 py-2.5">
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {mode === "ai" && aiMessages.length > 0 && (!ticket || ticket.status === "closed") && (
              <div className="px-4 pb-2 shrink-0">
                <button
                  onClick={handleEscalate}
                  disabled={escalating}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-theme-400 bg-theme-500/10 hover:bg-theme-500/20 rounded-xl transition-colors disabled:opacity-50"
                >
                  {escalating ? <Loader2 size={13} className="animate-spin" /> : <UserCheck2 size={13} />}
                  Talk to a human
                </button>
              </div>
            )}

            <div className="p-3 border-t border-border-subtle shrink-0">
              {attachedImage && (
                <div className="relative inline-block mb-2">
                  <img src={attachedImage} alt="attachment" className="h-14 rounded-lg border border-border" />
                  <button onClick={() => setAttachedImage(null)} className="absolute -top-1.5 -right-1.5 bg-black rounded-full p-0.5 border border-border">
                    <X size={11} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleAttach(e.target.files[0])} />
                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-muted-foreground hover:text-foreground bg-muted rounded-xl transition-colors shrink-0" title="Attach screenshot">
                  <ImageIcon size={16} />
                </button>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 min-w-0 bg-muted border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-theme-500/50 transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || (!text.trim() && !attachedImage)}
                  className="p-2.5 bg-theme-500 hover:bg-theme-400 text-white rounded-xl transition-colors disabled:opacity-50 shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-[60] flex items-center justify-center gap-2 w-12 h-12 sm:w-auto sm:h-auto sm:pl-3 sm:pr-4 sm:py-3 bg-theme-500 hover:bg-theme-400 text-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-colors"
      >
        <div className="relative shrink-0">
          {aiSupportLogo ? (
            <img src={aiSupportLogo} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : open ? (
            <X size={20} />
          ) : (
            <MessageCircle size={20} />
          )}
          {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-theme-500" />}
        </div>
        <span className="hidden sm:inline text-sm font-bold whitespace-nowrap">{name}</span>
      </motion.button>
    </>
  );
}
