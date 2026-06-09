import express, { Request, Response } from "express";
import mongoose from "mongoose";
import upload from "../middleware/uploads";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import {
  buildClinicAddressFromText,
  formatClinicAddressText,
  mergeClinicAddresses,
  parseClinicAddresses,
  type ClinicAddress,
} from "../utils/clinicAddresses";
import { generateNextClinicCuc } from "../utils/clinicCuc";

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

const normalizeContactNumber = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").trim();

const parseBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
  }

  return fallback;
};

const normalizeDoctors = (value: unknown) => {
  const parsed = parseDoctors(value);

  return parsed
    .map((item) => ({
      name: typeof item?.name === "string" ? item.name.trim() : "",
      regNo: typeof item?.regNo === "string" ? item.regNo.trim() : "",
      specialization:
        typeof item?.specialization === "string"
          ? item.specialization.trim()
          : "",
    }))
    .filter(
      (item) => item.name && item.regNo && item.specialization
    );
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const hasOwn = (obj: Record<string, unknown> | undefined, key: string) =>
  Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

const buildClinicAddressesFromRequest = (
  body: Record<string, unknown> | undefined,
  fallbackAddress: string,
  clinicName: string,
  contactNumber: string
): ClinicAddress[] => {
  const parsedAddresses = parseClinicAddresses(body?.addresses);
  if (parsedAddresses.length > 0) {
    return mergeClinicAddresses([], parsedAddresses);
  }

  if (fallbackAddress.trim()) {
    return [
      buildClinicAddressFromText(fallbackAddress, {
        type: "Clinic",
        fullName: clinicName,
        mobileNo: contactNumber,
      }),
    ];
  }

  return [];
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
    { name: "specialOffers", maxCount: 5 },
    { name: "photos", maxCount: 10 },
    { name: "certifications", maxCount: 5 },
  ]),
  async (req: Request, res: Response) => {
  try {
    const files = req.files as
      | {
          [fieldname: string]: Express.Multer.File[];
        }
      | undefined;

    const {
      clinicName,
      dermaCategory,
      address,
      addresses: _addresses,
      email,
      contactNo,
      contactNumber,
      doctors,
      video,
      verifiedBadge,
      isActive,
      ...rest
    } = req.body;

    if (!clinicName || !dermaCategory || !address || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const categoryExists = await ClinicCategory.findById(dermaCategory);
    if (!categoryExists) {
      return res.status(400).json({ message: "Invalid clinic category" });
    }

    const parsedDoctors = normalizeDoctors(doctors);
    const normalizedContactNumber =
      normalizeContactNumber(contactNumber) ||
      normalizeContactNumber(contactNo);
    const nextCuc = await generateNextClinicCuc();
    const clinicAddresses = buildClinicAddressesFromRequest(
      req.body,
      String(address).trim(),
      String(clinicName).trim(),
      normalizedContactNumber
    );
    const nextAddressText =
      clinicAddresses[0]?.address || formatClinicAddressText(clinicAddresses[0]) || String(address).trim();

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
      address: nextAddressText,
      addresses: clinicAddresses,
      email: String(email).trim(),
      ...(normalizedContactNumber ? { contactNumber: normalizedContactNumber } : {}),
      doctors: parsedDoctors,
      clinicLogo: uploadedClinicLogo[0] || undefined,
      bannerImage: uploadedBannerImage[0] || undefined,
      rateCard: uploadedRateCard,
      specialOffers: uploadedSpecialOffers,
      photos: uploadedPhotos,
      certifications: uploadedCertifications,
      video: video,
      verifiedBadge: parseBoolean(verifiedBadge, false),
      isActive: parseBoolean(isActive, true),
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
          "cuc clinicName slug website contactNumber email dermaCategory address clinicStatus verifiedBadge isActive doctors clinicLogo bannerImage photos createdAt updatedAt"
        )
        .populate("dermaCategory", "name")
        .lean();

      return res.json(clinics.map(stripHeavyClinicFields));
    }

    const clinics = await Clinic.find({ isActive: { $ne: false } }).populate("dermaCategory", "name");
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
router.put(
  "/:id",
  upload.fields([
    { name: "clinicLogo", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
    { name: "rateCard", maxCount: 1 },
    { name: "specialOffers", maxCount: 5 },
    { name: "photos", maxCount: 10 },
    { name: "certifications", maxCount: 5 },
  ]),
  async (req, res) => {
  try {
    const existingClinic = await Clinic.findById(req.params.id);
    if (!existingClinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    const files = req.files as
      | {
          [fieldname: string]: Express.Multer.File[];
        }
      | undefined;

    const nextClinicName =
      typeof req.body?.clinicName === "string" && req.body.clinicName.trim()
        ? req.body.clinicName.trim()
        : existingClinic.clinicName;

    const nextSlug = await buildUniqueClinicSlug(
      nextClinicName,
      existingClinic._id.toString()
    );

    const uploadedClinicLogo = getUploadedPaths(files?.clinicLogo);
    const uploadedBannerImage = getUploadedPaths(files?.bannerImage);
    const uploadedRateCard = getUploadedPaths(files?.rateCard);
    const uploadedSpecialOffers = getUploadedPaths(files?.specialOffers);
    const uploadedPhotos = getUploadedPaths(files?.photos);
    const uploadedCertifications = getUploadedPaths(files?.certifications);
    const normalizedContactNumber =
      normalizeContactNumber(req.body?.contactNumber) ||
      normalizeContactNumber(req.body?.contactNo);
    const parsedDoctors =
      typeof req.body?.doctors !== "undefined"
        ? normalizeDoctors(req.body.doctors)
        : existingClinic.doctors;
    const parsedRateCard = parseStringArray(req.body?.rateCard);
    const parsedSpecialOffers = parseStringArray(req.body?.specialOffers);
    const parsedPhotos = parseStringArray(req.body?.photos);
    const parsedCertifications = parseStringArray(req.body?.certifications);
    const hasAddressesField = hasOwn(req.body, "addresses");
    const parsedAddresses = parseClinicAddresses(req.body?.addresses);
    const nextAddresses = hasAddressesField
      ? mergeClinicAddresses([], parsedAddresses)
      : Array.isArray(existingClinic.addresses)
      ? mergeClinicAddresses([], existingClinic.addresses)
      : String(req.body?.address || "").trim()
      ? [
          buildClinicAddressFromText(String(req.body?.address || "").trim(), {
            type: "Clinic",
            fullName: nextClinicName,
            mobileNo: normalizedContactNumber || existingClinic.contactNumber || "",
          }),
        ]
      : [];
    const nextAddressText = hasAddressesField
      ? String(req.body?.address || "").trim() ||
        formatClinicAddressText(nextAddresses[0]) ||
        ""
      : String(req.body?.address || "").trim() || existingClinic.address || "";

    const updated = await Clinic.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        address: nextAddressText,
        ...(hasAddressesField || nextAddresses.length
          ? { addresses: nextAddresses }
          : {}),
        ...(normalizedContactNumber ? { contactNumber: normalizedContactNumber } : {}),
        ...(hasOwn(req.body, "verifiedBadge")
          ? { verifiedBadge: parseBoolean(req.body.verifiedBadge, false) }
          : {}),
        ...(hasOwn(req.body, "isActive")
          ? { isActive: parseBoolean(req.body.isActive, true) }
          : {}),
        slug: nextSlug,
        doctors: parsedDoctors,
        ...(uploadedClinicLogo.length ? { clinicLogo: uploadedClinicLogo[0] } : {}),
        ...(uploadedBannerImage.length ? { bannerImage: uploadedBannerImage[0] } : {}),
        ...(uploadedRateCard.length
          ? { rateCard: uploadedRateCard }
          : req.body?.rateCard
          ? { rateCard: parsedRateCard }
          : {}),
        ...(uploadedSpecialOffers.length
          ? { specialOffers: uploadedSpecialOffers }
          : req.body?.specialOffers
          ? { specialOffers: parsedSpecialOffers }
          : {}),
        ...(uploadedPhotos.length
          ? { photos: uploadedPhotos }
          : req.body?.photos
          ? { photos: parsedPhotos }
          : {}),
        ...(uploadedCertifications.length
          ? { certifications: uploadedCertifications }
          : req.body?.certifications
          ? { certifications: parsedCertifications }
          : {}),
      },
      { new: true }
    ).populate("dermaCategory", "name");

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update clinic" });
  }
  }
);

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
