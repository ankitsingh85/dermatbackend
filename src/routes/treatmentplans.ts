import express from "express";
import mongoose from "mongoose";
import Clinic from "../models/clinic";
import TreatmentPlan from "../models/treatmentplans";

const router = express.Router();

const slugifyTreatmentName = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "treatment-plan-details";
};

const buildUniqueTreatmentSlug = async (
  treatmentName: string,
  excludeId?: string
) => {
  const baseSlug = slugifyTreatmentName(treatmentName);
  let slug = baseSlug;
  let counter = 2;

  while (
    await TreatmentPlan.findOne({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
};

const ensureTreatmentSlug = async (plan: any) => {
  if (!plan) return plan;
  if (plan.slug) return plan;

  plan.slug = await buildUniqueTreatmentSlug(
    plan.treatmentName || "treatment-plan-details",
    plan._id?.toString()
  );
  await plan.save();
  return plan;
};

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
  async (req, res) => {
    try {
      const {
        tuc,
        treatmentName,
        slug: incomingSlug,
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

      const slug =
        typeof incomingSlug === "string" && incomingSlug.trim()
          ? incomingSlug.trim()
          : await buildUniqueTreatmentSlug(treatmentName);

      const created = await TreatmentPlan.create({
        tuc,
        treatmentName,
        slug,
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
        treatmentImages: parseStringArray(req.body.treatmentImages),
        beforeImages: parseStringArray(req.body.beforeImages),
        afterImages: parseStringArray(req.body.afterImages),
        categoryIcons: parseStringArray(req.body.categoryIcons),
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

    for (const plan of plans as any[]) {
      await ensureTreatmentSlug(plan);
    }

    return res.json(plans);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch treatment plans" });
  }
});

router.get("/:identifier", async (req, res) => {
  try {
    const identifier = req.params.identifier;

    let plan = await TreatmentPlan.findOne({ slug: identifier }).populate(
      "clinic",
      "clinicName email"
    );

    if (!plan && mongoose.isValidObjectId(identifier)) {
      plan = await TreatmentPlan.findById(identifier).populate(
        "clinic",
        "clinicName email"
      );
    }

    if (!plan) {
      const plans = await TreatmentPlan.find()
        .populate("clinic", "clinicName email")
        .sort({ createdAt: -1 });
      const matched = (plans as any[]).find(
        (item) =>
          slugifyTreatmentName(item.treatmentName || "") === identifier
      );
      plan = matched || null;
    }

    if (!plan) return res.status(404).json({ message: "Treatment plan not found" });
    return res.json(plan);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch treatment plan" });
  }
});

router.put(
  "/:id",
  async (req, res) => {
    try {
      const payload: Record<string, unknown> = {
        ...req.body,
      };

      if (typeof payload.treatmentName === "string") {
        payload.slug = await buildUniqueTreatmentSlug(
          payload.treatmentName,
          req.params.id
        );
      }

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

      if (payload.treatmentImages !== undefined) {
        payload.treatmentImages = parseStringArray(payload.treatmentImages);
      }
      if (payload.beforeImages !== undefined) {
        payload.beforeImages = parseStringArray(payload.beforeImages);
      }
      if (payload.afterImages !== undefined) {
        payload.afterImages = parseStringArray(payload.afterImages);
      }
      if (payload.categoryIcons !== undefined) {
        payload.categoryIcons = parseStringArray(payload.categoryIcons);
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
