import express, { Request, Response } from "express";
import upload from "../middleware/uploads";
import Course from "../models/course";


const router = express.Router();

const textOnlyRegex = /^[A-Za-z ]+$/;
const digitsOnlyRegex = /^\d+$/;
const isValidYoutubeUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return host.includes("youtube.com") || host.includes("youtu.be");
  } catch {
    return false;
  }
};

const stripHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const numberFields = [
  "feesInr",
  "netFeesInr",
  "discountPercent",
  "maximumSeatsBatchSize",
] as const;
const dateFields = ["startDate", "endDate", "registrationDeadline"] as const;


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

const getUploadedPaths = (
  files: Express.Multer.File[] | undefined,
): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const trimStringField = (value: unknown) =>
  typeof value === "string" ? value.trim() : value;
const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const COURSE_CODE_PREFIX = "CourName";

const generateCourseUniqueCode = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yearMonth = `${year}${month}`;

  const lastCourse = await Course.findOne({
    courseUniqueCode: {
      $regex: `^${COURSE_CODE_PREFIX}${yearMonth}-`,
    },
  }).sort({ createdAt: -1 });

  let nextSeries = 1;

  if (lastCourse && lastCourse.courseUniqueCode) {
    const lastNumber = Number(
      lastCourse.courseUniqueCode.split("-").pop()
    );

    if (!isNaN(lastNumber)) {
      nextSeries = lastNumber + 1;
    }
  }

  return `${COURSE_CODE_PREFIX}${yearMonth}-${nextSeries}`;
};
const normalizePayload = (
  body: Record<string, unknown>,
  files?: { [fieldname: string]: Express.Multer.File[] },
) => {
  const payload: Record<string, unknown> = { ...body };

  /* ================= NUMBERS ================= */

  for (const field of numberFields) {
    const value = payload[field];

    if (value === "" || value === null || value === undefined) {
      delete payload[field];
      continue;
    }

    const parsed = Number(value);

    if (!Number.isNaN(parsed)) {
      payload[field] = parsed;
    } else {
      delete payload[field];
    }
  }

  /* ================= DATES ================= */

  for (const field of dateFields) {
    const value = payload[field];

    if (!value) {
      delete payload[field];
      continue;
    }

    const parsedDate = new Date(String(value));

    payload[field] = Number.isNaN(parsedDate.getTime())
      ? "INVALID_DATE"
      : parsedDate;
  }

  /* ================= BOOLEAN ================= */

  if (payload.applyDiscountVoucher !== undefined) {
    payload.applyDiscountVoucher = parseBoolean(
      payload.applyDiscountVoucher,
      false,
    );
  }

  /* ================= STRING FIELDS ================= */

  const stringFields = [
    "courseName",
    "hsnCode",
    "instituteName",
    "courseDuration",
    "modeOfTraining",
    "curriculumTopicsCovered",
    "certificationProvided",
    "affiliationAccreditation",
    "discountsOffers",
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
    "postCourseSupport",
    "mobileNo",
    "contactForQueries",
  ];

  stringFields.forEach((field) => {
    if (payload[field] !== undefined) {
      payload[field] = trimStringField(payload[field]);
    }
  });

  /* ================= COURSE TYPE FIX ================= */
  if (payload.courseType !== undefined) {
    const types = parseStringArray(payload.courseType);

    if (types.length > 0) {
      payload.courseType = types;
    } else {
      delete payload.courseType;
    }
  }

  /* ================= TARGET AUDIENCE FIX ================= */
  if (payload.targetAudience !== undefined) {
    const audience = parseStringArray(payload.targetAudience);

    if (audience.length > 0) {
      payload.targetAudience = audience;
    } else {
      delete payload.targetAudience;
    }
  }

  /* ================= COURSE IMAGE FIX ================= */

  const uploadedCourseImage = getUploadedPaths(files?.courseImage);

  if (uploadedCourseImage.length > 0) {
    payload.courseImage = uploadedCourseImage[0];
  } else if (payload.courseImage !== undefined) {
    const oldImage = trimStringField(payload.courseImage);

    if (oldImage) {
      payload.courseImage = oldImage;
    } else {
      delete payload.courseImage;
    }
  }

  /* ================= TRAINER IMAGE FIX ================= */

  const uploadedTrainerImage = getUploadedPaths(files?.trainerImage);

  if (uploadedTrainerImage.length > 0) {
    payload.trainerImage = uploadedTrainerImage[0];
  } else if (payload.trainerImage !== undefined) {
    const oldImage = trimStringField(payload.trainerImage);

    if (oldImage) {
      payload.trainerImage = oldImage;
    } else {
      delete payload.trainerImage;
    }
  }

  /* ================= BROCHURE PDF FIX ================= */

  const uploadedBrochures = getUploadedPaths(files?.brochurePdfDownload);

  if (uploadedBrochures.length > 0) {
    payload.brochurePdfDownload = uploadedBrochures;
  } else if (payload.brochurePdfDownload !== undefined) {
    const brochures = parseStringArray(payload.brochurePdfDownload);

    if (brochures.length > 0) {
      payload.brochurePdfDownload = brochures;
    } else {
      delete payload.brochurePdfDownload;
    }
  }

  return payload;
};

const validateCoursePayload = (
  payload: Record<string, unknown>,
  isCreate = false,
) => {
  const requiredTextFields = [
    "courseName",
    "courseType",
    "hsnCode",
    "instituteName",
    "courseDuration",
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
    "postCourseSupport",
    "mobileNo",
    "contactForQueries",
  ] as const;

  for (const field of requiredTextFields) {
    if (field === "courseType") {
      if (
        isCreate &&
        (!Array.isArray(payload.courseType) || payload.courseType.length === 0)
      ) {
        return { message: "Please select at least one course type" };
      }
      continue;
    }

    if (isCreate && !stripHtml(payload[field])) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} is required`,
      };
    }
  }

  for (const field of dateFields) {
    if (payload[field] === "INVALID_DATE") {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} must be a valid date`,
      };
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

  const requiredNumberFields = [
    "feesInr",
    "netFeesInr",
    "discountPercent",
    "maximumSeatsBatchSize",
  ] as const;

  for (const field of requiredNumberFields) {
    if (
      isCreate &&
      (payload[field] === undefined ||
        payload[field] === null ||
        payload[field] === "")
    ) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} is required`,
      };
    }

    if (payload[field] !== undefined && Number.isNaN(Number(payload[field]))) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} must be a valid number`,
      };
    }

    if (
      payload[field] !== undefined &&
      !Number.isInteger(Number(payload[field]))
    ) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} must contain digits only`,
      };
    }

    if (
      field === "discountPercent" &&
      payload[field] !== undefined &&
      (Number(payload[field]) < 0 || Number(payload[field]) > 100)
    ) {
      return { message: "Discount % must be between 0 and 100" };
    }
  }

  if (
    payload.mobileNo !== undefined &&
    !digitsOnlyRegex.test(String(payload.mobileNo))
  ) {
    return { message: "Mobile number must contain digits only" };
  }

  if (
    payload.mobileNo !== undefined &&
    String(payload.mobileNo).trim() &&
    String(payload.mobileNo).trim().length !== 10
  ) {
    return { message: "Mobile number must be exactly 10 digits" };
  }

  if (
    payload.courseDemoVideo !== undefined &&
    !isValidYoutubeUrl(payload.courseDemoVideo)
  ) {
    return { message: "Course demo video must be a valid YouTube link" };
  }

  if (
    isCreate &&
    (!payload.courseImage ||
      typeof payload.courseImage !== "string" ||
      !String(payload.courseImage).trim())
  ) {
    return { message: "Course image is required" };
  }

  if (
    isCreate &&
    (!payload.trainerImage ||
      typeof payload.trainerImage !== "string" ||
      !String(payload.trainerImage).trim())
  ) {
    return { message: "Trainer image is required" };
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
    payload.targetAudience !== undefined &&
    !Array.isArray(payload.targetAudience)
  ) {
    return { message: "Target audience must be a valid list" };
  }

  if (
    isCreate &&
    Array.isArray(payload.targetAudience) &&
    payload.targetAudience.length === 0
  ) {
    return { message: "At least one target audience item is required" };
  }

  return null;
};

router.get(
  "/next-code",
  async (req: Request, res: Response) => {

    try {

      const courseName =
        String(
          req.query.courseName || ""
        ).trim();


      if (!courseName) {

        return res.status(400).json({
          message:
          "Course name is required",
        });

      }


  const courseUniqueCode = await generateCourseUniqueCode();
      return res.json({
        courseUniqueCode,
      });


    } catch (err:any) {

      return res.status(500).json({
        message:
        err.message ||
        "Failed to generate course code",
      });

    }

  }
);

router.post(
  "/",
  upload.fields([
    { name: "courseImage", maxCount: 1 },
    { name: "trainerImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizePayload(req.body, files);
      const validationError = validateCoursePayload(payload, true);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      if (!String(payload.courseName || "").trim()) {
        return res.status(400).json({ message: "Course name is required" });
      }

    payload.courseUniqueCode = await generateCourseUniqueCode();



      const course = new Course({
        ...payload,
        courseName: String(payload.courseName).trim(),
        courseUniqueCode: String(payload.courseUniqueCode).trim(),
      });

      await course.save();
      return res.status(201).json(course);
    } catch (err: any) {
      console.error("Create course error:", err);
      return res
        .status(500)
        .json({ message: err.message || "Failed to create course" });
    }
  },
);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    return res.json(courses);
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to fetch courses" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json(course);
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to fetch course" });
  }
});

router.put(
  "/:id",
  upload.fields([
    { name: "courseImage", maxCount: 1 },
    { name: "trainerImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizePayload(req.body, files);
      const validationError = validateCoursePayload(payload, false);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      if (payload.courseUniqueCode) {
        const duplicateCourse = await Course.findOne({
          _id: { $ne: req.params.id },
          courseUniqueCode: String(payload.courseUniqueCode).trim(),
        });

        if (duplicateCourse) {
          return res
            .status(409)
            .json({ message: "Course unique code already exists" });
        }
      }

      const updatedCourse = await Course.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true },
      );

      if (!updatedCourse) {
        return res.status(404).json({ message: "Course not found" });
      }

      return res.json(updatedCourse);
    } catch (err: any) {
      return res
        .status(500)
        .json({ message: err.message || "Failed to update course" });
    }
  },
);

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);

    if (!deletedCourse) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json({ message: "Course deleted successfully" });
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to delete course" });
  }
});

export default router;