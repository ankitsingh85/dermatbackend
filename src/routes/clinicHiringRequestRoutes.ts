import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Clinic from "../models/clinic";
import ClinicHiringRequest, {
  HiringMessageSender,
  HiringRequestStatus,
} from "../models/clinicHiringRequest";
import { AuthRequest, clinicAuth } from "../middleware/authClinic";

const router = express.Router();

const allowedStatuses: HiringRequestStatus[] = [
  "pending",
  "in_review",
  "accepted",
  "rejected",
  "fulfilled",
];

const cleanText = (value: unknown) => String(value ?? "").trim();

const cleanNumber = (value: unknown, fallback = 1) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(1, Math.round(numberValue));
};

router.post("/", clinicAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clinicId = cleanText(req.clinic?.id);

    if (!mongoose.isValidObjectId(clinicId)) {
      return res.status(401).json({ message: "Invalid clinic session" });
    }

    const clinic = await Clinic.findById(clinicId).select(
      "clinicName email contactNumber address city"
    );

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    const roleRequired = cleanText(req.body?.roleRequired);
    const location = cleanText(req.body?.location);

    if (!roleRequired || !location) {
      return res
        .status(400)
        .json({ message: "Role required and location are required" });
    }

    const request = await ClinicHiringRequest.create({
      clinicId: clinic._id,
      clinicName: clinic.clinicName || "",
      clinicEmail: clinic.email || "",
      clinicPhone: clinic.contactNumber || "",
      roleRequired,
      teamMembersRequired: cleanNumber(req.body?.teamMembersRequired),
      experienceRequired: cleanText(req.body?.experienceRequired),
      location,
      jobType: cleanText(req.body?.jobType) || "Full time",
      salaryRange: cleanText(req.body?.salaryRange),
      commissionEnabled: Boolean(req.body?.commissionEnabled),
      commissionDetails: cleanText(req.body?.commissionDetails),
      requiredSkills: cleanText(req.body?.requiredSkills),
      additionalInfo: cleanText(req.body?.additionalInfo),
      messages: [],
    });

    return res.status(201).json({
      message: "Hiring request sent to admin",
      request,
    });
  } catch (err: any) {
    console.error("Create hiring request error:", err);
    return res.status(500).json({
      message: "Failed to create hiring request",
      error: err.message,
    });
  }
});

router.get("/clinic", clinicAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clinicId = cleanText(req.clinic?.id);

    if (!mongoose.isValidObjectId(clinicId)) {
      return res.status(401).json({ message: "Invalid clinic session" });
    }

    const requests = await ClinicHiringRequest.find({ clinicId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(requests);
  } catch (err: any) {
    console.error("Fetch clinic hiring requests error:", err);
    return res.status(500).json({
      message: "Failed to fetch hiring requests",
      error: err.message,
    });
  }
});

router.get("/admin", async (_req: Request, res: Response) => {
  try {
    const requests = await ClinicHiringRequest.find()
      .sort({ createdAt: -1 })
      .populate("clinicId", "clinicName email contactNumber address")
      .lean();

    return res.json(requests);
  } catch (err: any) {
    console.error("Fetch admin hiring requests error:", err);
    return res.status(500).json({
      message: "Failed to fetch hiring requests",
      error: err.message,
    });
  }
});

router.patch("/admin/:id/status", async (req: Request, res: Response) => {
  try {
    const requestId = cleanText(req.params.id);
    const status = cleanText(req.body?.status) as HiringRequestStatus;

    if (!mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const request = await ClinicHiringRequest.findByIdAndUpdate(
      requestId,
      { status },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ message: "Hiring request not found" });
    }

    return res.json({
      message: "Status updated",
      request,
    });
  } catch (err: any) {
    console.error("Update hiring status error:", err);
    return res.status(500).json({
      message: "Failed to update status",
      error: err.message,
    });
  }
});

router.post("/:id/messages", async (req: Request, res: Response) => {
  try {
    const requestId = cleanText(req.params.id);
    const senderType = cleanText(req.body?.senderType) as HiringMessageSender;
    const message = cleanText(req.body?.message);

    if (!mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    if (senderType !== "clinic" && senderType !== "admin") {
      return res.status(400).json({ message: "Invalid sender type" });
    }

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const request = await ClinicHiringRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Hiring request not found" });
    }

    request.messages.push({
      senderType,
      senderName: cleanText(req.body?.senderName),
      message,
      isRead: false,
    });

    await request.save();

    return res.status(201).json({
      message: "Message sent",
      request,
    });
  } catch (err: any) {
    console.error("Send hiring message error:", err);
    return res.status(500).json({
      message: "Failed to send message",
      error: err.message,
    });
  }
});

router.get("/:id/messages", async (req: Request, res: Response) => {
  try {
    const requestId = cleanText(req.params.id);

    if (!mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const request = (await ClinicHiringRequest.findById(requestId)
      .select("messages")
      .lean()) as { messages?: unknown[] } | null;

    if (!request) {
      return res.status(404).json({ message: "Hiring request not found" });
    }

    return res.json(request.messages || []);
  } catch (err: any) {
    console.error("Fetch hiring messages error:", err);
    return res.status(500).json({
      message: "Failed to fetch messages",
      error: err.message,
    });
  }
});

export default router;
