import express, { Request, Response } from "express";
import mongoose from "mongoose";
import OnlineConsultationService from "../models/onlineConsultationService";
import Doctor from "../models/doctor";
import upload from "../middleware/uploads";

const router = express.Router();

/* ================= SERVICE CODE GENERATOR =================
   Format: OnCon-<YYYYMM>-<N>
   e.g. "OnCon-202606-1", "OnCon-202606-2" ...
   "OnCon" is a fixed prefix. The sequence number increments dynamically
   per month, across all online consultation services.
*/
const SERVICE_CODE_PREFIX = "OnCon";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generateNextOnlineConsultationCode = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const prefix = `${SERVICE_CODE_PREFIX}-${year}${month}-`;
  const escapedPrefix = escapeRegExp(prefix);

  const existing = await OnlineConsultationService.find({
    serviceCode: { $regex: `^${escapedPrefix}\\d+$` },
  }).select("serviceCode");

  let maxSeq = 0;
  const seqRegex = new RegExp(`^${escapedPrefix}(\\d+)$`);

  for (const service of existing) {
    const match = service.serviceCode?.match(seqRegex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return `${prefix}${maxSeq + 1}`;
};

const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const computeNextAvailableSlot = (timingSlots: string[], bookedSlots: string[]) =>
  timingSlots.find((slot) => !bookedSlots.includes(slot)) || "";

const validateDoctorIds = async (doctorIds: string[]) => {
  for (const id of doctorIds) {
    if (!mongoose.isValidObjectId(id)) {
      return "Invalid doctor id";
    }
  }

  if (doctorIds.length === 0) return null;

  const count = await Doctor.countDocuments({ _id: { $in: doctorIds } });
  if (count !== doctorIds.length) {
    return "Some selected doctors are invalid";
  }

  return null;
};

router.get("/next-code", async (_req: Request, res: Response) => {
  try {
    const serviceCode = await generateNextOnlineConsultationCode();
    return res.json({ serviceCode });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to generate service code",
    });
  }
});

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { serviceType, consultationFee, offerPrice, discountPercent } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!serviceType?.trim()) {
      return res.status(400).json({ message: "Service type is required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "Service image is required" });
    }

    const feeValue = Number(consultationFee);
    if (
      consultationFee === undefined ||
      consultationFee === "" ||
      Number.isNaN(feeValue) ||
      feeValue < 0
    ) {
      return res.status(400).json({ message: "Enter a valid consultation fee" });
    }

    const doctorIds = parseJsonArray(req.body.doctors);
    if (doctorIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one doctor" });
    }

    const doctorValidationError = await validateDoctorIds(doctorIds);
    if (doctorValidationError) {
      return res.status(400).json({ message: doctorValidationError });
    }

    let offerPriceValue: number | undefined;
    if (offerPrice !== undefined && offerPrice !== "") {
      offerPriceValue = Number(offerPrice);
      if (Number.isNaN(offerPriceValue) || offerPriceValue < 0) {
        return res.status(400).json({ message: "Enter a valid offer price" });
      }
    }

    let discountPercentValue = 0;
    if (discountPercent !== undefined && discountPercent !== "") {
      discountPercentValue = Number(discountPercent);
      if (
        Number.isNaN(discountPercentValue) ||
        discountPercentValue < 0 ||
        discountPercentValue > 100
      ) {
        return res.status(400).json({ message: "Discount % must be between 0 and 100" });
      }
    }

    const timingSlots = parseJsonArray(req.body.timingSlots);
    const bookedSlots = parseJsonArray(req.body.bookedSlots).filter((slot) =>
      timingSlots.includes(slot)
    );

    const serviceCode = await generateNextOnlineConsultationCode();

    const service = new OnlineConsultationService({
      serviceCode,
      serviceType: String(serviceType).trim(),
      doctors: doctorIds,
      imageUrl: uploadedImageUrl || legacyImageUrl,
      consultationFee: feeValue,
      ...(offerPriceValue !== undefined ? { offerPrice: offerPriceValue } : {}),
      discountPercent: discountPercentValue,
      timingSlots,
      bookedSlots,
      nextAvailableSlot: computeNextAvailableSlot(timingSlots, bookedSlots),
    });

    await service.save();
    const populated = await service.populate("doctors", "title firstName lastName specialist");
    res.status(201).json(populated);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create online consultation service", error: err });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const services = await OnlineConsultationService.find()
      .populate("doctors", "title firstName lastName specialist profileImage")
      .sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch online consultation services", error: err });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { serviceType, consultationFee, offerPrice, discountPercent, isActive } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    const service = await OnlineConsultationService.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Online consultation service not found" });
    }

    if (serviceType?.trim()) service.serviceType = String(serviceType).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      service.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    if (consultationFee !== undefined && consultationFee !== "") {
      const feeValue = Number(consultationFee);
      if (Number.isNaN(feeValue) || feeValue < 0) {
        return res.status(400).json({ message: "Enter a valid consultation fee" });
      }
      service.consultationFee = feeValue;
    }

    if (offerPrice !== undefined && offerPrice !== "") {
      const offerPriceValue = Number(offerPrice);
      if (Number.isNaN(offerPriceValue) || offerPriceValue < 0) {
        return res.status(400).json({ message: "Enter a valid offer price" });
      }
      service.offerPrice = offerPriceValue;
    }

    if (discountPercent !== undefined && discountPercent !== "") {
      const discountPercentValue = Number(discountPercent);
      if (
        Number.isNaN(discountPercentValue) ||
        discountPercentValue < 0 ||
        discountPercentValue > 100
      ) {
        return res.status(400).json({ message: "Discount % must be between 0 and 100" });
      }
      service.discountPercent = discountPercentValue;
    }

    if (req.body.doctors !== undefined) {
      const doctorIds = parseJsonArray(req.body.doctors);
      if (doctorIds.length === 0) {
        return res.status(400).json({ message: "Please select at least one doctor" });
      }
      const doctorValidationError = await validateDoctorIds(doctorIds);
      if (doctorValidationError) {
        return res.status(400).json({ message: doctorValidationError });
      }
      service.doctors = doctorIds as any;
    }

    let slotsChanged = false;
    if (req.body.timingSlots !== undefined) {
      service.timingSlots = parseJsonArray(req.body.timingSlots);
      slotsChanged = true;
    }
    if (req.body.bookedSlots !== undefined) {
      service.bookedSlots = parseJsonArray(req.body.bookedSlots).filter((slot) =>
        service.timingSlots.includes(slot)
      );
      slotsChanged = true;
    }
    if (slotsChanged) {
      service.nextAvailableSlot = computeNextAvailableSlot(
        service.timingSlots,
        service.bookedSlots
      );
    }

    if (isActive !== undefined) {
      service.isActive = String(isActive).toLowerCase() === "true";
    }

    const updated = await service.save();
    const populated = await updated.populate("doctors", "title firstName lastName specialist");
    res.json(populated);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update online consultation service", error: err });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const service = await OnlineConsultationService.findByIdAndDelete(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Online consultation service not found" });
    }

    res.json({ message: "Online consultation service deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete online consultation service", error: err });
  }
});

export default router;
