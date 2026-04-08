import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Clinic from "../models/clinic";
import Lead from "../models/lead";
import User from "../models/user";
import { clinicAuth, AuthRequest } from "../middleware/authClinic";
import { userAuth, UserAuthRequest } from "../middleware/authUser";

const router = express.Router();

const normalizeActionType = (value: unknown) => {
  const action = String(value ?? "").toLowerCase().trim();
  return action === "call" || action === "whatsapp" ? action : "";
};

router.post("/", userAuth, async (req: UserAuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const clinicId = String(req.body?.clinicId || "").trim();
    const actionType = normalizeActionType(req.body?.actionType);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(clinicId)) {
      return res.status(400).json({ message: "Invalid clinicId" });
    }

    if (!actionType) {
      return res.status(400).json({ message: "Invalid action type" });
    }

    const [clinic, user] = await Promise.all([
      Clinic.findById(clinicId).select("clinicName slug"),
      User.findById(userId).select("name email contactNo patientId profileImage"),
    ]);

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userProfileImage =
      user.profileImage && user.profileImage.startsWith("data:image")
        ? ""
        : user.profileImage || "";

    const lead = await Lead.create({
      clinicId: clinic._id,
      userId: user._id,
      actionType,
      clinicName: clinic.clinicName || "",
      clinicSlug: clinic.slug || "",
      userName: user.name || "",
      userEmail: user.email || "",
      userContactNo: user.contactNo || "",
      userPatientId: user.patientId || "",
      userProfileImage,
    });

    return res.status(201).json({
      message: "Lead recorded successfully",
      lead,
    });
  } catch (err: any) {
    console.error("Create lead error:", err);
    return res.status(500).json({
      message: "Failed to record lead",
      error: err.message,
    });
  }
});

router.get(
  "/clinic/:clinicId",
  clinicAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const clinicId = String(req.params.clinicId || "").trim();
      const loggedInClinicId = String(req.clinic?.id || "").trim();

      if (!mongoose.isValidObjectId(clinicId)) {
        return res.status(400).json({ message: "Invalid clinicId" });
      }

      if (clinicId !== loggedInClinicId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const leads = await Lead.find({ clinicId })
        .sort({ createdAt: -1 })
        .lean();

      return res.json(leads);
    } catch (err: any) {
      console.error("Fetch leads error:", err);
      return res.status(500).json({
        message: "Failed to fetch leads",
        error: err.message,
      });
    }
  }
);

router.delete(
  "/:leadId",
  clinicAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const clinicId = String(req.clinic?.id || "").trim();
      const leadId = String(req.params.leadId || "").trim();

      if (!mongoose.isValidObjectId(leadId)) {
        return res.status(400).json({ message: "Invalid leadId" });
      }

      const lead = await Lead.findById(leadId);

      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      if (String(lead.clinicId) !== clinicId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await Lead.findByIdAndDelete(leadId);

      return res.json({
        message: "Lead deleted successfully",
      });
    } catch (err: any) {
      console.error("Delete lead error:", err);
      return res.status(500).json({
        message: "Failed to delete lead",
        error: err.message,
      });
    }
  }
);

export default router;
