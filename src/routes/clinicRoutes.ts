import express, { Request, Response } from "express";
import mongoose from "mongoose";
import upload from "../middleware/uploads";
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

const generateClinicCuc = async () => {
  let cuc = "";
  do {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    cuc = `CUC-${suffix}`;
  } while (await Clinic.findOne({ cuc }));
  return cuc;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const parseDoctors = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const stripHeavyClinicFields = (clinic: any) => {
  const clone =
    typeof clinic?.toObject === "function" ? clinic.toObject() : { ...clinic };

  if (typeof clone.clinicLogo === "string" && clone.clinicLogo.startsWith("data:")) {
    clone.clinicLogo = "";
  }
  if (typeof clone.bannerImage === "string" && clone.bannerImage.startsWith("data:")) {
    clone.bannerImage = "";
  }
  if (Array.isArray(clone.photos)) {
    clone.photos = clone.photos.filter(
      (item: string) => typeof item === "string" && !item.startsWith("data:")
    );
  }
  return clone;
};

/* ================= CREATE CLINIC ================= */
router.post(
  "/",
  upload.fields([
    { name: "clinicLogo", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
    { name: "rateCard", maxCount: 1 },
    { name: "specialOffers", maxCount: 20 },
    { name: "photos", maxCount: 20 },
    { name: "certifications", maxCount: 20 },
  ]),
  async (req: Request, res: Response) => {
  try {
    const files = req.files as
      | {
          [fieldname: string]: Express.Multer.File[];
        }
      | undefined;

    const {
      cuc,
      clinicName,
      dermaCategory,
      address,
      email,
      doctors,
      videos,
      ...rest
    } = req.body;

    if (!clinicName || !dermaCategory || !address || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const categoryExists = await ClinicCategory.findById(dermaCategory);
    if (!categoryExists) {
      return res.status(400).json({ message: "Invalid clinic category" });
    }

    const requestedCuc = typeof cuc === "string" ? cuc.trim() : "";
    const nextCuc =
      requestedCuc && !(await Clinic.findOne({ cuc: requestedCuc }))
        ? requestedCuc
        : await generateClinicCuc();

    const parsedDoctors = parseDoctors(doctors);

    const uploadedClinicLogo = getUploadedPaths(files?.clinicLogo);
    const uploadedBannerImage = getUploadedPaths(files?.bannerImage);
    const uploadedRateCard = getUploadedPaths(files?.rateCard);
    const uploadedSpecialOffers = getUploadedPaths(files?.specialOffers);
    const uploadedPhotos = getUploadedPaths(files?.photos);
    const uploadedCertifications = getUploadedPaths(files?.certifications);

    const clinic = await Clinic.create({
      cuc: nextCuc,
      clinicName: String(clinicName).trim(),
      slug: await buildUniqueClinicSlug(String(clinicName).trim()),
      dermaCategory,
      address: String(address).trim(),
      email: String(email).trim(),
      doctors: parsedDoctors,
      clinicLogo: uploadedClinicLogo[0] || undefined,
      bannerImage: uploadedBannerImage[0] || undefined,
      rateCard: uploadedRateCard,
      specialOffers: uploadedSpecialOffers,
      photos: uploadedPhotos,
      certifications: uploadedCertifications,
      videos: parseStringArray(videos),
      ...rest,
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
  }
);

/* ================= GET ALL CLINICS ================= */
router.get("/", async (req, res) => {
  try {
    const lightMode = String(req.query.light || "").toLowerCase() === "true";
    if (lightMode) {
      const clinics = await Clinic.find()
        .select(
          "cuc clinicName slug website contactNumber email dermaCategory address clinicStatus doctors clinicLogo bannerImage photos createdAt updatedAt"
        )
        .populate("dermaCategory", "name")
        .lean();

      return res.json(clinics.map(stripHeavyClinicFields));
    }

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
