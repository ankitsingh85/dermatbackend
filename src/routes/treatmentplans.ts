import express from "express";
import mongoose from "mongoose";
import upload from "../middleware/uploads";
import Clinic from "../models/clinic";
import TreatmentPlan from "../models/treatmentplans";

const router = express.Router();

const parseNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const getUploadedPaths = (
  files: Express.Multer.File[] | undefined
): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
};

router.post(
  "/",
  upload.fields([
    { name: "treatmentImages", maxCount: 10 },
    { name: "beforeImages", maxCount: 10 },
    { name: "afterImages", maxCount: 10 },
    { name: "categoryIcons", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const {
        tuc,
        treatmentName,
        clinic,
        description,
        shortReelUrl,
        serviceCategory,
        mrp,
        offerPrice,
        pricePerSession,
        discountPercent,
        sessions,
        duration,
        validity,
        technologyUsed,
        gender,
        promoCode,
        addToCart,
        isActive,
      } = req.body;

      if (!tuc || !treatmentName || !clinic) {
        return res
          .status(400)
          .json({ message: "tuc, treatmentName and clinic are required" });
      }

      if (!mongoose.isValidObjectId(clinic)) {
        return res.status(400).json({ message: "Invalid clinic id format" });
      }

      const clinicExists = await Clinic.exists({ _id: clinic });
      if (!clinicExists) {
        return res.status(400).json({ message: "Invalid clinic id" });
      }

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };
      const uploadedTreatmentImages = getUploadedPaths(files?.treatmentImages);
      const uploadedBeforeImages = getUploadedPaths(files?.beforeImages);
      const uploadedAfterImages = getUploadedPaths(files?.afterImages);
      const uploadedCategoryIcons = getUploadedPaths(files?.categoryIcons);

      const created = await TreatmentPlan.create({
        tuc,
        treatmentName,
        clinic,
        description,
        shortReelUrl,
        serviceCategory,
        mrp: parseNumber(mrp),
        offerPrice: parseNumber(offerPrice),
        pricePerSession: parseNumber(pricePerSession),
        discountPercent: parseNumber(discountPercent),
        sessions,
        duration,
        validity,
        technologyUsed,
        gender,
        promoCode,
        addToCart: parseBoolean(addToCart, true),
        isActive: parseBoolean(isActive, true),
        treatmentImages:
          uploadedTreatmentImages.length > 0
            ? uploadedTreatmentImages
            : parseStringArray(req.body.treatmentImages),
        beforeImages:
          uploadedBeforeImages.length > 0
            ? uploadedBeforeImages
            : parseStringArray(req.body.beforeImages),
        afterImages:
          uploadedAfterImages.length > 0
            ? uploadedAfterImages
            : parseStringArray(req.body.afterImages),
        categoryIcons:
          uploadedCategoryIcons.length > 0
            ? uploadedCategoryIcons
            : parseStringArray(req.body.categoryIcons),
      });

      const populated = await TreatmentPlan.findById(created._id).populate(
        "clinic",
        "clinicName email"
      );

      return res.status(201).json(populated);
    } catch (error: any) {
      console.error("Create treatment plan error:", error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "Treatment unique code already exists. Please try again.",
        });
      }
      return res.status(500).json({
        message: "Failed to create treatment plan",
        error: error.message,
      });
    }
  }
);

router.get("/", async (_req, res) => {
  try {
    const plans = await TreatmentPlan.find()
      .populate("clinic", "clinicName email")
      .sort({ createdAt: -1 });
    return res.json(plans);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch treatment plans" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const plan = await TreatmentPlan.findById(req.params.id).populate(
      "clinic",
      "clinicName email"
    );
    if (!plan) return res.status(404).json({ message: "Treatment plan not found" });
    return res.json(plan);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch treatment plan" });
  }
});

router.put(
  "/:id",
  upload.fields([
    { name: "treatmentImages", maxCount: 10 },
    { name: "beforeImages", maxCount: 10 },
    { name: "afterImages", maxCount: 10 },
    { name: "categoryIcons", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const payload: Record<string, unknown> = {
        ...req.body,
      };

      if (payload.clinic) {
        if (!mongoose.isValidObjectId(String(payload.clinic))) {
          return res.status(400).json({ message: "Invalid clinic id format" });
        }
        const clinicExists = await Clinic.exists({ _id: payload.clinic });
        if (!clinicExists) {
          return res.status(400).json({ message: "Invalid clinic id" });
        }
      }

      if (payload.mrp !== undefined) payload.mrp = parseNumber(payload.mrp);
      if (payload.offerPrice !== undefined) {
        payload.offerPrice = parseNumber(payload.offerPrice);
      }
      if (payload.pricePerSession !== undefined) {
        payload.pricePerSession = parseNumber(payload.pricePerSession);
      }
      if (payload.discountPercent !== undefined) {
        payload.discountPercent = parseNumber(payload.discountPercent);
      }
      if (payload.addToCart !== undefined) {
        payload.addToCart = parseBoolean(payload.addToCart, true);
      }
      if (payload.isActive !== undefined) {
        payload.isActive = parseBoolean(payload.isActive, true);
      }

      const uploadedTreatmentImages = getUploadedPaths(files?.treatmentImages);
      const uploadedBeforeImages = getUploadedPaths(files?.beforeImages);
      const uploadedAfterImages = getUploadedPaths(files?.afterImages);
      const uploadedCategoryIcons = getUploadedPaths(files?.categoryIcons);

      if (uploadedTreatmentImages.length > 0) {
        payload.treatmentImages = uploadedTreatmentImages;
      }
      if (uploadedBeforeImages.length > 0) {
        payload.beforeImages = uploadedBeforeImages;
      }
      if (uploadedAfterImages.length > 0) {
        payload.afterImages = uploadedAfterImages;
      }
      if (uploadedCategoryIcons.length > 0) {
        payload.categoryIcons = uploadedCategoryIcons;
      }

      const updated = await TreatmentPlan.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
      ).populate("clinic", "clinicName email");

      if (!updated) {
        return res.status(404).json({ message: "Treatment plan not found" });
      }

      return res.json(updated);
    } catch (error: any) {
      console.error("Update treatment plan error:", error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "Treatment unique code already exists. Please try again.",
        });
      }
      return res.status(500).json({
        message: "Failed to update treatment plan",
        error: error.message,
      });
    }
  }
);

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await TreatmentPlan.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Treatment plan not found" });
    }
    return res.json({ message: "Treatment plan deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete treatment plan" });
  }
});

export default router;
