import express, { Request, Response } from "express";
import mongoose from "mongoose";
import HiringRequest, { HiringRequestStatus } from "../models/hiringRequest";
import SupportTicket, { TicketPriority } from "../models/supportTicket";
import upload from "../middleware/uploads";
import { businessAuth, optionalBusinessAuth, BusinessAuthRequest } from "../middleware/authBusiness";
import { resolveRequesterProfile } from "../utils/resolveRequesterProfile";

const router = express.Router();

const cleanText = (value: unknown) => String(value ?? "").trim();

const ALLOWED_STATUSES: HiringRequestStatus[] = ["pending", "in_review", "fulfilled", "cancelled"];
const ALLOWED_PRIORITIES: TicketPriority[] = ["low", "medium", "high"];

const REQUEST_PREFIX = "HR";

const generateRequestNumber = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${REQUEST_PREFIX}-${year}${month}-`;

  const last = await HiringRequest.findOne({
    requestNumber: { $regex: `^${prefix}\\d+$` },
  }).sort({ createdAt: -1 });

  const lastSeq = Number(last?.requestNumber?.split("-").pop());
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${nextSeq}`;
};

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

/** ✅ BUSINESS: send a new hiring request — no ticket/conversation yet,
 * just the structured job requirement. Status starts as "pending"
 * (shown to the requester as "Request Sent"). */
router.post("/", businessAuth, async (req: BusinessAuthRequest, res: Response) => {
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

    const roleRequired = cleanText(req.body?.roleRequired);
    const location = cleanText(req.body?.location);
    if (!roleRequired || !location) {
      return res.status(400).json({ message: "Role and location are required" });
    }

    const teamMembersRequired = Number(req.body?.teamMembersRequired) || 1;

    const requestNumber = await generateRequestNumber();

    const request = await HiringRequest.create({
      requestNumber,
      requesterType,
      requesterId,
      requesterName: profile.name,
      requesterEmail: profile.email,
      requesterPhone: profile.phone,
      status: "pending",
      hiringDetails: {
        roleRequired,
        jobType: cleanText(req.body?.jobType),
        teamMembersRequired,
        experienceRequired: cleanText(req.body?.experienceRequired),
        location,
        salaryRange: cleanText(req.body?.salaryRange),
        requiredSkills: cleanText(req.body?.requiredSkills),
        additionalInfo: cleanText(req.body?.additionalInfo),
      },
    });

    return res.status(201).json({ message: "Request sent", request });
  } catch (err: any) {
    console.error("Create hiring request error:", err);
    return res.status(500).json({ message: "Failed to send request", error: err.message });
  }
});

/** ✅ BUSINESS: list the logged-in requester's own hiring requests. */
router.get("/mine", businessAuth, async (req: BusinessAuthRequest, res: Response) => {
  try {
    const requesterId = req.business?.id;
    const requesterType = req.business?.role;
    if (!requesterId || !requesterType) {
      return res.status(401).json({ message: "Invalid business session" });
    }

    const query: Record<string, unknown> = { requesterType, requesterId };
    if (typeof req.query.status === "string" && ALLOWED_STATUSES.includes(req.query.status as HiringRequestStatus)) {
      query.status = req.query.status;
    }

    const requests = await HiringRequest.find(query).sort({ createdAt: -1 }).lean();
    return res.json(requests);
  } catch (err: any) {
    console.error("Fetch my hiring requests error:", err);
    return res.status(500).json({ message: "Failed to fetch requests", error: err.message });
  }
});

/** ✅ ADMIN: list every hiring request, newest first. */
router.get("/", async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.status === "string" && ALLOWED_STATUSES.includes(req.query.status as HiringRequestStatus)) {
      query.status = req.query.status;
    }
    if (typeof req.query.requesterType === "string") {
      query.requesterType = req.query.requesterType;
    }

    const requests = await HiringRequest.find(query).sort({ createdAt: -1 }).lean();
    return res.json(requests);
  } catch (err: any) {
    console.error("Fetch all hiring requests error:", err);
    return res.status(500).json({ message: "Failed to fetch requests", error: err.message });
  }
});

/** Hiring request detail — business owner (auth'd) or admin (unauthenticated). */
router.get("/:id", optionalBusinessAuth, async (req: BusinessAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const request = await HiringRequest.findById(id).lean();
    if (!request) {
      return res.status(404).json({ message: "Hiring request not found" });
    }

    if (req.business && String(request.requesterId) !== String(req.business.id)) {
      return res.status(403).json({ message: "You cannot view this request" });
    }

    return res.json(request);
  } catch (err: any) {
    console.error("Fetch hiring request error:", err);
    return res.status(500).json({ message: "Failed to fetch request", error: err.message });
  }
});

/** ✅ ADMIN: update a hiring request's status (pending/in_review/fulfilled/cancelled). */
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const status = cleanText(req.body?.status) as HiringRequestStatus;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const request = await HiringRequest.findByIdAndUpdate(id, { status }, { new: true });
    if (!request) {
      return res.status(404).json({ message: "Hiring request not found" });
    }

    return res.json({ message: "Status updated", request });
  } catch (err: any) {
    console.error("Update hiring request status error:", err);
    return res.status(500).json({ message: "Failed to update status", error: err.message });
  }
});

/** ✅ BUSINESS: raise a ticket (a query/conversation) against this hiring
 * request. Only one active (non-closed) ticket is allowed per request at
 * a time — once it's closed, a new one can be raised the same way. */
router.post(
  "/:id/tickets",
  businessAuth,
  upload.array("attachments", 5),
  async (req: BusinessAuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid request id" });
      }

      const requesterType = req.business?.role;
      const requesterId = req.business?.id;
      if (!requesterType || !requesterId) {
        return res.status(401).json({ message: "Invalid business session" });
      }

      const request = await HiringRequest.findById(id);
      if (!request) {
        return res.status(404).json({ message: "Hiring request not found" });
      }
      if (String(request.requesterId) !== String(requesterId)) {
        return res.status(403).json({ message: "You cannot raise a ticket on this request" });
      }

      const activeTicket = await SupportTicket.exists({
        hiringRequestId: id,
        status: { $ne: "closed" },
      });
      if (activeTicket) {
        return res.status(400).json({ message: "You already have an open ticket for this request" });
      }

      const message = cleanText(req.body?.message);
      if (!message) {
        return res.status(400).json({ message: "Please describe your query" });
      }

      const priority = ALLOWED_PRIORITIES.includes(req.body?.priority)
        ? (req.body.priority as TicketPriority)
        : "medium";

      const files = req.files as Express.Multer.File[] | undefined;
      const attachments = (files || []).map((file) => ({
        url: `/uploads/${file.filename}`,
        name: file.originalname,
      }));

      const ticketNumber = await generateTicketNumber();

      const ticket = await SupportTicket.create({
        ticketNumber,
        requesterType,
        requesterId,
        requesterName: request.requesterName,
        requesterEmail: request.requesterEmail,
        requesterPhone: request.requesterPhone,
        department: "Hiring",
        subject: cleanText(req.body?.subject) || `Query on ${request.hiringDetails.roleRequired}`,
        priority,
        status: "open",
        hiringDetails: request.hiringDetails,
        hiringRequestId: request._id,
        messages: [
          {
            senderType: "requester",
            senderName: request.requesterName,
            message,
            attachments,
          },
        ],
      });

      return res.status(201).json({ message: "Ticket raised", ticket });
    } catch (err: any) {
      console.error("Raise ticket on hiring request error:", err);
      return res.status(500).json({ message: "Failed to raise ticket", error: err.message });
    }
  }
);

export default router;
