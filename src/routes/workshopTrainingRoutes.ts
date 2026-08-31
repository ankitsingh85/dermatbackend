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

const getUploadedPaths = (
  files: Express.Multer.File[] | undefined,
): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

/* ================= TRAINING CODE GENERATOR (fixed prefix) ================= */

const TRAINING_CODE_PREFIX = "TrngName";

const generateTrainingUniqueCode = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yearMonth = `${year}${month}`;

  const lastTraining = await WorkshopTraining.findOne({
    trainingUniqueCode: {
      $regex: `^${TRAINING_CODE_PREFIX}${yearMonth}-`,
    },
  }).sort({ createdAt: -1 });

  let nextSeries = 1;

  if (lastTraining && lastTraining.trainingUniqueCode) {
    const lastNumber = Number(
      lastTraining.trainingUniqueCode.split("-").pop()
    );

    if (!isNaN(lastNumber)) {
      nextSeries = lastNumber + 1;
    }
  }

  return `${TRAINING_CODE_PREFIX}${yearMonth}-${nextSeries}`;
};

const normalizePayload = (
  body: Record<string, unknown>,
  files?: { [fieldname: string]: Express.Multer.File[] },
) => {
  const payload: Record<string, unknown> = { ...body };

  const numericFields = [
    "feesInr",
    "netFeesInr",
    "discountPercent",
    "maximumSeatsBatchSize",
  ] as const;

  const dateFields = ["startDate", "endDate", "registrationDeadline"] as const;

  for (const field of numericFields) {
    if (payload[field] !== undefined) {
      payload[field] = parseNumber(payload[field]);
    }
  }

  for (const field of dateFields) {
    if (payload[field] !== undefined) {
      payload[field] = parseDateValue(payload[field]);
    }
  }

  const stringFields = [
    "trainingName",
    "trainingUniqueCode",
    "hsnCode",
    "instituteName",
    "trainingDuration",
    "modeOfTraining",
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
    "courseDemoVideo",
    "refundCancellationPolicy",
    "postTrainingSupport",
    "contactForQueries",
  ];

  stringFields.forEach((field) => {
    if (payload[field] !== undefined) {
      payload[field] = trimStringField(payload[field]);
    }
  });

  // Optional fields with a schema-level enum/format validator would throw
  // on an empty string instead of being left unset. Blank input on these
  // now just means "not provided".
  const dropIfBlank = ["certificationProvided", "languageOfDelivery", "trainerInstructorName"];
  dropIfBlank.forEach((field) => {
    if (typeof payload[field] === "string" && !payload[field]) {
      delete payload[field];
    }
  });

  if (payload.applyDiscountVoucher !== undefined) {
    payload.applyDiscountVoucher = parseBoolean(
      payload.applyDiscountVoucher,
      false,
    );
  }

  if (payload.installmentEmiOption !== undefined) {
    payload.installmentEmiOption = parseBoolean(
      payload.installmentEmiOption,
      false,
    );
  }

  // TRAINING TYPE FIX (multi-select)

  if (payload.trainingType !== undefined) {
    const parsed = parseStringArray(payload.trainingType);

    if (parsed.length > 0) {
      payload.trainingType = parsed;
    } else {
      delete payload.trainingType;
    }
  }

  // TARGET AUDIENCE FIX

  if (payload.targetAudience !== undefined) {
    const parsed = parseStringArray(payload.targetAudience);

    if (parsed.length > 0) {
      payload.targetAudience = parsed;
    } else {
      delete payload.targetAudience;
    }
  }

  // IMAGE FIX

  const uploadedTrainingImages = getUploadedPaths(files?.trainingImage);

  if (uploadedTrainingImages.length > 0) {
    payload.trainingImage = uploadedTrainingImages[0];
  }

  // TRAINER IMAGE FIX (separate from the main workshop image above)

  const uploadedTrainerImages = getUploadedPaths(files?.trainerImage);

  if (uploadedTrainerImages.length > 0) {
    payload.trainerImage = uploadedTrainerImages[0];
  }

  // BROCHURE FIX

  const uploadedBrochures = getUploadedPaths(files?.brochurePdfDownload);

  if (uploadedBrochures.length > 0) {
    payload.brochurePdfDownload = uploadedBrochures;
  } else if (payload.brochurePdfDownload !== undefined) {
    const existing = parseStringArray(payload.brochurePdfDownload);

    if (existing.length > 0) {
      payload.brochurePdfDownload = existing;
    } else {
      delete payload.brochurePdfDownload;
    }
  }

  return payload;
};

// Only trainingName, instituteName and netFeesInr are mandatory to
// create a workshop training — everything else is optional and, if
// provided, is still format-checked below (but never required).
const validatePayload = (
  payload: Record<string, unknown>,
  isCreate = false,
) => {
  const requiredTextFields = ["trainingName", "trainingUniqueCode", "instituteName"] as const;

  const labelMap: Record<string, string> = {
    trainingName: "Training name",
    trainingUniqueCode: "Training unique code",
    trainingType: "Training type",
    hsnCode: "HSN Code",
    discountPercent: "Discount %",
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
    feesInr: "Fees (INR)",
    netFeesInr: "Net Fees (INR)",
    maximumSeatsBatchSize: "Maximum Seats / Batch Size",
  };

  for (const field of requiredTextFields) {
    if (isCreate && !stripHtml(payload[field])) {
      return { message: `${labelMap[field] || field} is required` };
    }
  }

  if (
    isCreate &&
    (payload.netFeesInr === undefined ||
      payload.netFeesInr === null ||
      payload.netFeesInr === "")
  ) {
    return { message: `${labelMap.netFeesInr} is required` };
  }

  for (const field of [
    "startDate",
    "endDate",
    "registrationDeadline",
  ] as const) {
    if (payload[field] === "INVALID_DATE") {
      return { message: `${labelMap[field]} must be a valid date` };
    }
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
    return {
      message:
        "Trainer / instructor name should contain only letters and spaces",
    };
  }

  const numberFieldsIfProvided = [
    "feesInr",
    "netFeesInr",
    "discountPercent",
    "maximumSeatsBatchSize",
  ] as const;

  for (const field of numberFieldsIfProvided) {
    if (payload[field] === undefined) continue;
    if (Number.isNaN(Number(payload[field]))) {
      return { message: `${labelMap[field] || field} must be a valid number` };
    }
    if (!Number.isInteger(Number(payload[field]))) {
      return {
        message: `${labelMap[field] || field} must contain digits only`,
      };
    }
    if (
      field === "discountPercent" &&
      (Number(payload[field]) < 0 || Number(payload[field]) > 100)
    ) {
      return { message: "Discount % must be between 0 and 100" };
    }
  }

  if (
    payload.targetAudience !== undefined &&
    !Array.isArray(payload.targetAudience)
  ) {
    return { message: "Target audience must be a valid list" };
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
    payload.certificationProvided !== undefined &&
    !["Yes", "No"].includes(String(payload.certificationProvided))
  ) {
    return { message: "Certification provided must be Yes or No" };
  }

  if (
    payload.languageOfDelivery !== undefined &&
    !["English", "Hindi", "Bilingual"].includes(
      String(payload.languageOfDelivery),
    )
  ) {
    return {
      message: "Language of delivery must be English, Hindi, or Bilingual",
    };
  }

  return null;
};

router.get("/next-code", async (_req: Request, res: Response) => {
  try {
    const trainingUniqueCode = await generateTrainingUniqueCode();
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
    { name: "trainerImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizePayload(
        req.body as Record<string, unknown>,
        files,
      );
      const validationError = validatePayload(payload, true);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      payload.trainingUniqueCode = await generateTrainingUniqueCode();

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
  },
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
    { name: "trainerImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizePayload(
        req.body as Record<string, unknown>,
        files,
      );
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
        { new: true, runValidators: true },
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
  },
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