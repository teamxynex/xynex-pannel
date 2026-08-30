import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { aiChat, getMyTicket, createTicket, listTickets, getTicket, postTicketMessage, claimTicket, closeTicket } from "../controllers/support.js";

const router = express.Router();
router.use(requireAuth);

router.post("/ai-chat", aiChat);

router.get("/ticket", getMyTicket);
router.post("/ticket", createTicket);

router.get("/tickets", listTickets);
router.get("/tickets/:id", getTicket);
router.post("/tickets/:id/messages", postTicketMessage);
router.post("/tickets/:id/claim", claimTicket);
router.post("/tickets/:id/close", closeTicket);

export default router;
