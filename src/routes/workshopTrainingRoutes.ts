import express, { Request, Response } from "express";
import upload from "../middleware/uploads";
import WorkshopTraining from "../models/workshopTraining";

const router = express.Router();

const textOnlyRegex = /^[A-Za-z ]+$/;
const digitsOnlyRegex = /^\d+$/;

const stripHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

const trimStringField = (value: unknown) =>
  typeof value === "string" ? value.trim() : value;

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const parseNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseDateValue = (value: unknown) => {
  if (!value) return undefined;
  const parsedDate = new Date(String(value));
  return Number.isNaN(parsedDate.getTime()) ? "INVALID_DATE" : parsedDate;
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const getNextTrainingCode = async () => {
  const latest = await WorkshopTraining.findOne({
    trainingUniqueCode: /^WTR\d{4,}$/,
  })
    .sort({ trainingUniqueCode: -1 })
    .select("trainingUniqueCode");

  const latestNumber = latest?.trainingUniqueCode.match(/(\d+)$/)?.[1];
  const nextNumber = latestNumber ? Number(latestNumber) + 1 : 1;

  return `WTR${String(nextNumber).padStart(4, "0")}`;
};

const normalizePayload = (
  body: Record<string, unknown>,
  files?: { [fieldname: string]: Express.Multer.File[] }
) => {
  const payload: Record<string, unknown> = { ...body };

  const numericFields = [
    "feesInr",
    "netFeesInr",
    "maximumSeatsBatchSize",
  ] as const;

  const dateFields = [
    "startDate",
    "endDate",
    "registrationDeadline",
  ] as const;

  for (const field of numericFields) {
    const parsed = parseNumber(payload[field]);
    payload[field] = parsed;
  }

  for (const field of dateFields) {
    payload[field] = parseDateValue(payload[field]);
  }

  payload.trainingName = trimStringField(payload.trainingName);
  payload.trainingUniqueCode = trimStringField(payload.trainingUniqueCode);
  payload.trainingType = trimStringField(payload.trainingType);
  payload.instituteName = trimStringField(payload.instituteName);
  payload.trainingDuration = trimStringField(payload.trainingDuration);
  payload.modeOfTraining = trimStringField(payload.modeOfTraining);
  payload.curriculumTopicsCovered = trimStringField(payload.curriculumTopicsCovered);
  payload.certificationProvided = trimStringField(payload.certificationProvided);
  payload.affiliationAccreditation = trimStringField(payload.affiliationAccreditation);
  payload.location = trimStringField(payload.location);
  payload.currentAvailability = trimStringField(payload.currentAvailability);
  payload.trainerInstructorName = trimStringField(payload.trainerInstructorName);
  payload.trainerExperience = trimStringField(payload.trainerExperience);
  payload.languageOfDelivery = trimStringField(payload.languageOfDelivery);
  payload.whatsIncluded = trimStringField(payload.whatsIncluded);
  payload.whatsNotIncluded = trimStringField(payload.whatsNotIncluded);
  payload.learningOutcomes = trimStringField(payload.learningOutcomes);
  payload.courseDemoVideo = trimStringField(payload.courseDemoVideo);
  payload.refundCancellationPolicy = trimStringField(payload.refundCancellationPolicy);
  payload.postTrainingSupport = trimStringField(payload.postTrainingSupport);
  payload.contactForQueries = trimStringField(payload.contactForQueries);

  payload.applyDiscountVoucher = parseBoolean(payload.applyDiscountVoucher, false);
  payload.installmentEmiOption = parseBoolean(payload.installmentEmiOption, false);
  payload.targetAudience = parseStringArray(payload.targetAudience);
  payload.brochurePdfDownload = parseStringArray(payload.brochurePdfDownload);

  const uploadedTrainingImages = getUploadedPaths(files?.trainingImage);
  payload.trainingImage =
    uploadedTrainingImages.length > 0
      ? uploadedTrainingImages[0]
      : trimStringField(payload.trainingImage);

  const uploadedBrochures = getUploadedPaths(files?.brochurePdfDownload);
  payload.brochurePdfDownload =
    uploadedBrochures.length > 0
      ? uploadedBrochures
      : parseStringArray(payload.brochurePdfDownload);

  return payload;
};

const validatePayload = (payload: Record<string, unknown>, isCreate = false) => {
  const requiredTextFields = [
    "trainingName",
    "trainingUniqueCode",
    "trainingType",
    "instituteName",
    "trainingDuration",
    "modeOfTraining",
    "startDate",
    "endDate",
    "registrationDeadline",
    "curriculumTopicsCovered",
    "certificationProvided",
    "affiliationAccreditation",
    "location",
    "currentAvailability",
    "trainerInstructorName",
    "trainerExperience",
    "languageOfDelivery",
    "whatsIncluded",
    "whatsNotIncluded",
    "learningOutcomes",
    "refundCancellationPolicy",
    "postTrainingSupport",
    "contactForQueries",
  ] as const;

  const labelMap: Record<string, string> = {
    trainingName: "Training name",
    trainingUniqueCode: "Training unique code",
    trainingType: "Training type",
    instituteName: "Institute name",
    trainingDuration: "Training duration",
    modeOfTraining: "Mode of training",
    startDate: "Start date",
    endDate: "End date",
    registrationDeadline: "Registration deadline",
    curriculumTopicsCovered: "Curriculum / Topics Covered",
    certificationProvided: "Certification Provided",
    affiliationAccreditation: "Affiliation / Accreditation",
    location: "Location",
    currentAvailability: "Current Availability",
    trainerInstructorName: "Trainer / Instructor Name",
    trainerExperience: "Trainer Experience",
    languageOfDelivery: "Language of Delivery",
    whatsIncluded: "What's Included",
    whatsNotIncluded: "What's Not Included",
    learningOutcomes: "Learning Outcomes",
    refundCancellationPolicy: "Refund / Cancellation Policy",
    postTrainingSupport: "Post-Training Support",
    contactForQueries: "Contact for Queries",
    courseDemoVideo: "Course Demo Video",
  };

  for (const field of requiredTextFields) {
    if (isCreate && !stripHtml(payload[field])) {
      return { message: `${labelMap[field] || field} is required` };
    }
  }

  for (const field of ["startDate", "endDate", "registrationDeadline"] as const) {
    if (payload[field] === "INVALID_DATE") {
      return { message: `${labelMap[field]} must be a valid date` };
    }
  }

  if (payload.trainingName !== undefined && !textOnlyRegex.test(stripHtml(payload.trainingName))) {
    return { message: "Training name should contain only letters and spaces" };
  }

  if (
    payload.instituteName !== undefined &&
    !textOnlyRegex.test(stripHtml(payload.instituteName))
  ) {
    return { message: "Institute name should contain only letters and spaces" };
  }

  if (
    payload.trainerInstructorName !== undefined &&
    !textOnlyRegex.test(stripHtml(payload.trainerInstructorName))
  ) {
    return { message: "Trainer / instructor name should contain only letters and spaces" };
  }

  const requiredNumberFields = [
    "feesInr",
    "netFeesInr",
    "maximumSeatsBatchSize",
  ] as const;

  for (const field of requiredNumberFields) {
    if (isCreate && payload[field] === undefined) {
      return { message: `${labelMap[field] || field} is required` };
    }
    if (payload[field] !== undefined && Number.isNaN(Number(payload[field]))) {
      return { message: `${labelMap[field] || field} must be a valid number` };
    }
    if (payload[field] !== undefined && !Number.isInteger(Number(payload[field]))) {
      return { message: `${labelMap[field] || field} must contain digits only` };
    }
  }

  if (payload.targetAudience !== undefined && !Array.isArray(payload.targetAudience)) {
    return { message: "Target audience must be a valid list" };
  }

  if (isCreate && Array.isArray(payload.targetAudience) && payload.targetAudience.length === 0) {
    return { message: "At least one target audience item is required" };
  }

  if (
    payload.courseDemoVideo !== undefined &&
    String(payload.courseDemoVideo).trim() &&
    !(() => {
      try {
        const url = new URL(String(payload.courseDemoVideo).trim());
        const host = url.hostname.toLowerCase();
        return host.includes("youtube.com") || host.includes("youtu.be");
      } catch {
        return false;
      }
    })()
  ) {
    return { message: "Course demo video must be a valid YouTube link" };
  }

  if (
    isCreate &&
    (!payload.trainingImage || typeof payload.trainingImage !== "string" || !String(payload.trainingImage).trim())
  ) {
    return { message: "Training image is required" };
  }

  if (
    isCreate &&
    (!payload.brochurePdfDownload ||
      !Array.isArray(payload.brochurePdfDownload) ||
      !payload.brochurePdfDownload.length)
  ) {
    return { message: "At least one brochure PDF is required" };
  }

  if (
    payload.certificationProvided !== undefined &&
    !["Yes", "No"].includes(String(payload.certificationProvided))
  ) {
    return { message: "Certification provided must be Yes or No" };
  }

  if (
    payload.languageOfDelivery !== undefined &&
    !["English", "Hindi", "Bilingual"].includes(String(payload.languageOfDelivery))
  ) {
    return { message: "Language of delivery must be English, Hindi, or Bilingual" };
  }

  return null;
};

router.get("/next-code", async (_req: Request, res: Response) => {
  try {
    const trainingUniqueCode = await getNextTrainingCode();
    return res.json({ trainingUniqueCode });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to generate training code",
    });
  }
});

router.post(
  "/",
  upload.fields([
    { name: "trainingImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizePayload(req.body as Record<string, unknown>, files);
      const validationError = validatePayload(payload, true);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const requestedCode = String(payload.trainingUniqueCode || "").trim();
      payload.trainingUniqueCode = requestedCode || (await getNextTrainingCode());

      const existing = await WorkshopTraining.findOne({
        trainingUniqueCode: String(payload.trainingUniqueCode).trim(),
      });

      if (existing) {
        return res.status(409).json({
          message: "Training unique code already exists",
        });
      }

      const training = new WorkshopTraining({
        ...payload,
        trainingName: String(payload.trainingName).trim(),
        trainingUniqueCode: String(payload.trainingUniqueCode).trim(),
      });

      await training.save();
      return res.status(201).json(training);
    } catch (err: any) {
      console.error("Create workshop training error:", err);
      return res.status(500).json({
        message: err.message || "Failed to create workshop training",
      });
    }
  }
);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const trainings = await WorkshopTraining.find().sort({ createdAt: -1 });
    return res.json(trainings);
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to fetch workshop trainings",
    });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const training = await WorkshopTraining.findById(req.params.id);
    if (!training) {
      return res.status(404).json({ message: "Workshop training not found" });
    }
    return res.json(training);
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to fetch workshop training",
    });
  }
});

router.put(
  "/:id",
  upload.fields([
    { name: "trainingImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizePayload(req.body as Record<string, unknown>, files);
      const validationError = validatePayload(payload, false);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      if (payload.trainingUniqueCode) {
        const duplicate = await WorkshopTraining.findOne({
          _id: { $ne: req.params.id },
          trainingUniqueCode: String(payload.trainingUniqueCode).trim(),
        });

        if (duplicate) {
          return res.status(409).json({
            message: "Training unique code already exists",
          });
        }
      }

      const updated = await WorkshopTraining.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Workshop training not found" });
      }

      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({
        message: err.message || "Failed to update workshop training",
      });
    }
  }
);

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await WorkshopTraining.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Workshop training not found" });
    }

    return res.json({ message: "Workshop training deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to delete workshop training",
    });
  }
});

export default router;
