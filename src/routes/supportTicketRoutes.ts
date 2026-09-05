import express, { Request, Response } from "express";
import mongoose from "mongoose";
import SupportTicket, { TicketPriority, TicketStatus } from "../models/supportTicket";
import upload from "../middleware/uploads";
import { businessAuth, optionalBusinessAuth, BusinessAuthRequest } from "../middleware/authBusiness";
import { resolveRequesterProfile } from "../utils/resolveRequesterProfile";

const router = express.Router();

const cleanText = (value: unknown) => String(value ?? "").trim();

const ALLOWED_STATUSES: TicketStatus[] = ["open", "answered", "closed"];
const ALLOWED_PRIORITIES: TicketPriority[] = ["low", "medium", "high"];

const TICKET_PREFIX = "TCK";

const generateTicketNumber = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${TICKET_PREFIX}-${year}${month}-`;

  const last = await SupportTicket.findOne({
    ticketNumber: { $regex: `^${prefix}\\d+$` },
  }).sort({ createdAt: -1 });

  const lastSeq = Number(last?.ticketNumber?.split("-").pop());
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${nextSeq}`;
};

const getUploadedAttachments = (files: Express.Multer.File[] | undefined) =>
  (files || []).map((file) => ({
    url: `/uploads/${file.filename}`,
    name: file.originalname,
  }));

/** ✅ BUSINESS: create a new ticket (used by the hiring wizard, and for
 * "Raise New Ticket" once a previous one is closed). */
router.post(
  "/",
  businessAuth,
  upload.array("attachments", 5),
  async (req: BusinessAuthRequest, res: Response) => {
    try {
      const requesterType = req.business?.role;
      const requesterId = req.business?.id;
      if (!requesterType || !requesterId || !mongoose.isValidObjectId(requesterId)) {
        return res.status(401).json({ message: "Invalid business session" });
      }

      const profile = await resolveRequesterProfile(requesterType, requesterId);
      if (!profile) {
        return res.status(404).json({ message: "Requester account not found" });
      }

      const subject = cleanText(req.body?.subject);
      const message = cleanText(req.body?.message);
      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }

      const priority = ALLOWED_PRIORITIES.includes(req.body?.priority)
        ? (req.body.priority as TicketPriority)
        : "medium";

      let hiringDetails: Record<string, unknown> | undefined;
      if (typeof req.body?.hiringDetails === "string" && req.body.hiringDetails.trim()) {
        try {
          hiringDetails = JSON.parse(req.body.hiringDetails);
        } catch {
          hiringDetails = undefined;
        }
      }

      const hiringRequestId =
        typeof req.body?.hiringRequestId === "string" &&
        mongoose.isValidObjectId(req.body.hiringRequestId)
          ? req.body.hiringRequestId
          : undefined;

      const ticketNumber = await generateTicketNumber();
      const files = req.files as Express.Multer.File[] | undefined;

      const ticket = await SupportTicket.create({
        ticketNumber,
        requesterType,
        requesterId,
        requesterName: profile.name,
        requesterEmail: profile.email,
        requesterPhone: profile.phone,
        department: cleanText(req.body?.department) || "Hiring",
        subject,
        priority,
        status: "open",
        hiringDetails,
        hiringRequestId,
        messages: [
          {
            senderType: "requester",
            senderName: profile.name,
            message,
            attachments: getUploadedAttachments(files),
          },
        ],
      });

      return res.status(201).json({ message: "Ticket created", ticket });
    } catch (err: any) {
      console.error("Create support ticket error:", err);
      return res.status(500).json({ message: "Failed to create ticket", error: err.message });
    }
  }
);

/** ✅ BUSINESS: list the logged-in requester's own tickets. */
router.get("/mine", businessAuth, async (req: BusinessAuthRequest, res: Response) => {
  try {
    const requesterId = req.business?.id;
    const requesterType = req.business?.role;
    if (!requesterId || !requesterType) {
      return res.status(401).json({ message: "Invalid business session" });
    }

    const query: Record<string, unknown> = { requesterType, requesterId };
    if (typeof req.query.hiringRequestId === "string" && mongoose.isValidObjectId(req.query.hiringRequestId)) {
      query.hiringRequestId = req.query.hiringRequestId;
    }

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .select("-messages")
      .lean();

    return res.json(tickets);
  } catch (err: any) {
    console.error("Fetch my tickets error:", err);
    return res.status(500).json({ message: "Failed to fetch tickets", error: err.message });
  }
});

/** ✅ ADMIN: list every ticket, newest first. */
router.get("/", async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.status === "string" && ALLOWED_STATUSES.includes(req.query.status as TicketStatus)) {
      query.status = req.query.status;
    }
    if (typeof req.query.requesterType === "string") {
      query.requesterType = req.query.requesterType;
    }
    if (typeof req.query.hiringRequestId === "string" && mongoose.isValidObjectId(req.query.hiringRequestId)) {
      query.hiringRequestId = req.query.hiringRequestId;
    }

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .select("-messages")
      .lean();

    return res.json(tickets);
  } catch (err: any) {
    console.error("Fetch all tickets error:", err);
    return res.status(500).json({ message: "Failed to fetch tickets", error: err.message });
  }
});

/** ✅ Ticket detail — business owner (auth'd) or admin (unauthenticated,
 * matching this app's existing admin-route convention). */
router.get("/:id", optionalBusinessAuth, async (req: BusinessAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }

    const ticket = await SupportTicket.findById(id).lean();
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (req.business && String(ticket.requesterId) !== String(req.business.id)) {
      return res.status(403).json({ message: "You cannot view this ticket" });
    }

    return res.json(ticket);
  } catch (err: any) {
    console.error("Fetch ticket error:", err);
    return res.status(500).json({ message: "Failed to fetch ticket", error: err.message });
  }
});

/** Reply — from the business owner (auth'd, reopens as "open") or from
 * admin (no auth token sent, reopens/marks as "answered"). Replying on a
 * closed ticket reopens it, same as the reference support-desk flow. */
router.post(
  "/:id/reply",
  optionalBusinessAuth,
  upload.array("attachments", 5),
  async (req: BusinessAuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid ticket id" });
      }

      const message = cleanText(req.body?.message);
      const files = req.files as Express.Multer.File[] | undefined;
      const attachments = getUploadedAttachments(files);
      if (!message && attachments.length === 0) {
        return res.status(400).json({ message: "Message or attachment is required" });
      }

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      let senderType: "requester" | "admin";
      let senderName: string;
      let nextStatus: TicketStatus;

      if (req.business) {
        if (String(ticket.requesterId) !== String(req.business.id)) {
          return res.status(403).json({ message: "You cannot reply to this ticket" });
        }
        senderType = "requester";
        senderName = ticket.requesterName;
        nextStatus = "open";
      } else {
        senderType = "admin";
        senderName = cleanText(req.body?.senderName) || "Support Team";
        nextStatus = "answered";
      }

      ticket.messages.push({ senderType, senderName, message, attachments });
      ticket.status = nextStatus;
      await ticket.save();

      return res.status(201).json({ message: "Reply sent", ticket });
    } catch (err: any) {
      console.error("Reply to ticket error:", err);
      return res.status(500).json({ message: "Failed to send reply", error: err.message });
    }
  }
);

/** Change ticket status directly (e.g. close without replying) — from
 * admin (no auth token sent, matching this app's admin-route convention)
 * or from the ticket's own requester (auth'd, can only touch their own
 * ticket — e.g. to mark it resolved). */
router.patch("/:id/status", optionalBusinessAuth, async (req: BusinessAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const status = cleanText(req.body?.status) as TicketStatus;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (req.business) {
      const owned = await SupportTicket.exists({ _id: id, requesterId: req.business.id });
      if (!owned) {
        return res.status(403).json({ message: "You cannot update this ticket" });
      }
    }

    const ticket = await SupportTicket.findByIdAndUpdate(id, { status }, { new: true });
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    return res.json({ message: "Status updated", ticket });
  } catch (err: any) {
    console.error("Update ticket status error:", err);
    return res.status(500).json({ message: "Failed to update status", error: err.message });
  }
});

/** ✅ ADMIN: delete a ticket (no auth token sent, matching this app's
 * admin-route convention — see the other routes in this file). */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ticket id" });
    }

    const deleted = await SupportTicket.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    return res.json({ message: "Ticket deleted" });
  } catch (err: any) {
    console.error("Delete ticket error:", err);
    return res.status(500).json({ message: "Failed to delete ticket", error: err.message });
  }
});

export default router;
