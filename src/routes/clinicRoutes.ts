import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";

const router = express.Router();

const slugifyClinicName = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "clinic-detail-page";
};

const buildUniqueClinicSlug = async (
  clinicName: string,
  excludeId?: string
) => {
  const baseSlug = slugifyClinicName(clinicName);
  let slug = baseSlug;
  let counter = 2;

  while (
    await Clinic.findOne({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
};

const ensureClinicSlug = async (clinic: any) => {
  if (!clinic) return clinic;
  if (clinic.slug) return clinic;

  clinic.slug = await buildUniqueClinicSlug(
    clinic.clinicName || "clinic-detail-page",
    clinic._id?.toString()
  );
  await clinic.save();
  return clinic;
};

/* ================= CREATE CLINIC ================= */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      cuc,
      clinicName,
      dermaCategory,
      address,
      email,
      doctors,
      ...rest
    } = req.body;

    if (!cuc || !clinicName || !dermaCategory || !address || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const categoryExists = await ClinicCategory.findById(dermaCategory);
    if (!categoryExists) {
      return res.status(400).json({ message: "Invalid clinic category" });
    }

    const exists = await Clinic.findOne({ cuc });
    if (exists) {
      return res.status(400).json({ message: "Clinic already exists" });
    }

    const clinic = await Clinic.create({
      cuc,
      clinicName,
      slug: await buildUniqueClinicSlug(clinicName),
      dermaCategory,
      address,
      email,
      doctors,
      ...rest, // UI-only fields are safely ignored
    });

    res.status(201).json({
      message: "Clinic created successfully",
      clinic,
    });
  } catch (err: any) {
    console.error("Create clinic error:", err);
    res.status(500).json({
      message: "Failed to create clinic",
      error: err.message,
    });
  }
});

/* ================= GET ALL CLINICS ================= */
router.get("/", async (_req, res) => {
  try {
    const clinics = await Clinic.find().populate("dermaCategory", "name");
    for (const clinic of clinics) {
      await ensureClinicSlug(clinic);
    }
    res.json(clinics);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch clinics" });
  }
});

/* ================= GET SINGLE CLINIC ================= */
router.get("/:id", async (req, res) => {
  try {
    const identifier = req.params.id;
    let clinic = await Clinic.findOne({ slug: identifier }).populate(
      "dermaCategory",
      "name"
    );

    if (!clinic && mongoose.Types.ObjectId.isValid(identifier)) {
      clinic = await Clinic.findById(identifier).populate(
        "dermaCategory",
        "name"
      );
    }

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    await ensureClinicSlug(clinic);
    res.json(clinic);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch clinic" });
  }
});

/* ================= UPDATE CLINIC ================= */
router.put("/:id", async (req, res) => {
  try {
    const existingClinic = await Clinic.findById(req.params.id);
    if (!existingClinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    const nextClinicName =
      typeof req.body?.clinicName === "string" && req.body.clinicName.trim()
        ? req.body.clinicName.trim()
        : existingClinic.clinicName;

    const nextSlug = await buildUniqueClinicSlug(
      nextClinicName,
      existingClinic._id.toString()
    );

    const updated = await Clinic.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        slug: nextSlug,
      },
      { new: true }
    ).populate("dermaCategory", "name");

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update clinic" });
  }
});

/* ================= DELETE CLINIC ================= */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Clinic.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Clinic not found" });
    }
    res.json({ message: "Clinic deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete clinic" });
  }
});

export default router;
