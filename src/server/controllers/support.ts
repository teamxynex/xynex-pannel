import { Request, Response } from "express";
import { readJSON, writeJSON } from "../services/db.js";
import crypto from "crypto";

interface TicketMessage {
  id: string;
  sender: "user" | "ai" | "admin";
  senderName: string;
  text: string;
  image?: string; // base64 data URL, screenshots only
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

const isStaff = (role: string) => role === "admin" || role === "owner";

async function getTickets(): Promise<Ticket[]> {
  return (await readJSON("support-tickets.json")) || [];
}

async function saveTickets(tickets: Ticket[]) {
  await writeJSON("support-tickets.json", tickets);
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

// ---- AI Chat (ephemeral, not persisted until escalated to a ticket) ----

export const aiChat = async (req: Request, res: Response) => {
  try {
    const settings = (await readJSON("settings.json")) || {};
    if (!settings.aiSupportEnabled) {
      return res.status(501).json({ error: "AI support isn't enabled on this panel." });
    }
    const provider = settings.aiSupportProvider === "gemini" ? "gemini" : "groq";
    const apiKey = provider === "gemini" ? settings.aiSupportGeminiApiKey : settings.aiSupportGroqApiKey;
    if (!apiKey) {
      return res.status(501).json({ error: `AI support is enabled but no ${provider === "gemini" ? "Gemini" : "Groq"} API key has been configured yet.` });
    }

    const { message, image, history } = req.body as { message: string; image?: string; history?: { role: "user" | "assistant"; text: string }[] };
    if (!message && !image) return res.status(400).json({ error: "message is required" });

    const assistantName = settings.aiSupportName || "Support Assistant";
    const panelName = settings.panelName || "the panel";
    const systemPrompt = `You are ${assistantName}, a friendly, concise support assistant for ${panelName}, a Minecraft server hosting panel. Help the user troubleshoot problems with their servers, files, worlds, plugins, mods, backups, and account. Keep answers short and practical, using steps when helpful. If the user shares a screenshot, use it to understand their issue. If you cannot resolve the issue, or the user explicitly asks for a human, tell them they can tap "Talk to a human" to hand this conversation to the support team.`;

    const axios = (await import("axios")).default;
    let reply = "";

    if (provider === "groq") {
      const messages: any[] = [{ role: "system", content: systemPrompt }];
      for (const h of history || []) {
        messages.push({ role: h.role, content: h.text });
      }
      const userContent: any[] = [];
      if (message) userContent.push({ type: "text", text: message });
      if (image) userContent.push({ type: "image_url", image_url: { url: image } });
      messages.push({ role: "user", content: image ? userContent : message });

      const result = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        { model: "qwen/qwen3.6-27b", messages, temperature: 0.4, max_tokens: 800 },
        { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
      );
      reply = result.data?.choices?.[0]?.message?.content || "";
    } else {
      const contents: any[] = [];
      for (const h of history || []) {
        contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] });
      }
      const parts: any[] = [];
      if (message) parts.push({ text: message });
      if (image) {
        const match = image.match(/^data:(.+);base64,(.+)$/);
        if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
      }
      contents.push({ role: "user", parts });

      const result = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { system_instruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 800 } },
        { headers: { "Content-Type": "application/json" } }
      );
      reply = result.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
    }

    if (!reply) reply = "Sorry, I couldn't come up with a response. You can tap \"Talk to a human\" to reach the support team instead.";
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data?.error?.message || err.response?.data?.error || err.message || "AI support request failed." });
  }
};

// ---- Tickets (persisted, admin-visible) ----

export const getMyTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const tickets = await getTickets();
  const mine = tickets.filter((t) => t.userId === user.id && t.status !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ ticket: mine[0] || null });
};

export const createTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { messages } = req.body as { messages?: { sender: "user" | "ai"; text: string; image?: string }[] };

  const tickets = await getTickets();
  const existing = tickets.find((t) => t.userId === user.id && t.status !== "closed");
  if (existing) return res.json({ ticket: existing });

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: genId("ticket"),
    userId: user.id,
    username: user.username,
    status: "open",
    claimedBy: null,
    claimedByName: null,
    createdAt: now,
    updatedAt: now,
    messages: (messages || []).map((m) => ({
      id: genId("msg"),
      sender: m.sender,
      senderName: m.sender === "ai" ? "AI" : user.username,
      text: m.text || "",
      image: m.image,
      createdAt: now,
    })),
  };
  tickets.push(ticket);
  await saveTickets(tickets);

  const io = req.app.get("io");
  io?.to("support_admins").emit("support:new_ticket", ticket);
  res.json({ ticket });
};

export const listTickets = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!isStaff(user.role)) return res.status(403).json({ error: "Forbidden" });
  const tickets = await getTickets();
  const status = req.query.status as string | undefined;
  const filtered = status ? tickets.filter((t) => t.status === status) : tickets.filter((t) => t.status !== "closed");
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ tickets: filtered });
};

export const getTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const tickets = await getTickets();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.userId !== user.id && !isStaff(user.role)) return res.status(403).json({ error: "Forbidden" });
  res.json({ ticket });
};

export const postTicketMessage = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { text, image } = req.body as { text?: string; image?: string };
  if (!text && !image) return res.status(400).json({ error: "text or image is required" });

  const tickets = await getTickets();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status === "closed") return res.status(400).json({ error: "This ticket is closed." });

  const staff = isStaff(user.role);
  if (ticket.userId !== user.id && !staff) return res.status(403).json({ error: "Forbidden" });

  const message: TicketMessage = {
    id: genId("msg"),
    sender: staff && ticket.userId !== user.id ? "admin" : "user",
    senderName: user.username,
    text: text || "",
    image,
    createdAt: new Date().toISOString(),
  };
  ticket.messages.push(message);
  ticket.updatedAt = message.createdAt;
  if (message.sender === "admin" && ticket.status === "open") {
    ticket.status = "claimed";
    ticket.claimedBy = user.id;
    ticket.claimedByName = user.username;
  }
  await saveTickets(tickets);

  const io = req.app.get("io");
  io?.to(`support_${id}`).emit("support:message", { ticketId: id, message });
  io?.to("support_admins").emit("support:ticket_updated", ticket);
  io?.to(`support_user_${ticket.userId}`).emit("support:ticket_updated", ticket);
  res.json({ message, ticket });
};

export const claimTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!isStaff(user.role)) return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const tickets = await getTickets();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  ticket.status = "claimed";
  ticket.claimedBy = user.id;
  ticket.claimedByName = user.username;
  ticket.updatedAt = new Date().toISOString();
  await saveTickets(tickets);

  const io = req.app.get("io");
  io?.to("support_admins").emit("support:ticket_updated", ticket);
  io?.to(`support_user_${ticket.userId}`).emit("support:ticket_updated", ticket);
  res.json({ ticket });
};

export const closeTicket = async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;
  const tickets = await getTickets();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.userId !== user.id && !isStaff(user.role)) return res.status(403).json({ error: "Forbidden" });
  ticket.status = "closed";
  ticket.updatedAt = new Date().toISOString();
  await saveTickets(tickets);

  const io = req.app.get("io");
  io?.to(`support_${id}`).emit("support:ticket_closed", { ticketId: id });
  io?.to("support_admins").emit("support:ticket_updated", ticket);
  io?.to(`support_user_${ticket.userId}`).emit("support:ticket_updated", ticket);
  res.json({ ticket });
};
