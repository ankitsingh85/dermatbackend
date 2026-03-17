import express, { Request, Response } from "express";
import upload from "../middleware/uploads";
import Course from "../models/course";

const router = express.Router();

const numberFields = ["feesInr", "netFeesInr", "maximumSeatsBatchSize"] as const;
const dateFields = ["startDate", "endDate", "registrationDeadline"] as const;
const courseCodePrefix = "DRMC";

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

const getUploadedPaths = (files: Express.Multer.File[] | undefined): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const trimStringField = (value: unknown) => (typeof value === "string" ? value.trim() : value);

const getNextCourseCode = async () => {
  const latestCourse = await Course.findOne({
    courseUniqueCode: new RegExp(`^${courseCodePrefix}\\d{4,}$`),
  })
    .sort({ courseUniqueCode: -1 })
    .select("courseUniqueCode");

  const latestNumber = latestCourse?.courseUniqueCode.match(/(\d+)$/)?.[1];
  const nextNumber = latestNumber ? Number(latestNumber) + 1 : 1;

  return `${courseCodePrefix}${String(nextNumber).padStart(4, "0")}`;
};

const normalizePayload = (
  body: Record<string, unknown>,
  files?: { [fieldname: string]: Express.Multer.File[] }
) => {
  const payload: Record<string, unknown> = { ...body };

  for (const field of numberFields) {
    const value = payload[field];
    if (value === "" || value === null || value === undefined) {
      payload[field] = undefined;
      continue;
    }

    const parsed = Number(value);
    payload[field] = Number.isNaN(parsed) ? undefined : parsed;
  }

  for (const field of dateFields) {
    const value = payload[field];
    payload[field] = value ? new Date(String(value)) : undefined;
  }

  if (payload.applyDiscountVoucher !== undefined) {
    if (typeof payload.applyDiscountVoucher === "string") {
      payload.applyDiscountVoucher = payload.applyDiscountVoucher === "true";
    } else {
      payload.applyDiscountVoucher = Boolean(payload.applyDiscountVoucher);
    }
  }

  payload.courseName = trimStringField(payload.courseName);
  payload.courseUniqueCode = trimStringField(payload.courseUniqueCode);
  payload.courseType = trimStringField(payload.courseType);
  payload.instituteName = trimStringField(payload.instituteName);
  payload.courseDuration = trimStringField(payload.courseDuration);
  payload.modeOfTraining = trimStringField(payload.modeOfTraining);
  payload.curriculumTopicsCovered = trimStringField(payload.curriculumTopicsCovered);
  payload.certificationProvided = trimStringField(payload.certificationProvided);
  payload.affiliationAccreditation = trimStringField(payload.affiliationAccreditation);
  payload.discountsOffers = trimStringField(payload.discountsOffers);
  payload.location = trimStringField(payload.location);
  payload.currentAvailability = trimStringField(payload.currentAvailability);
  payload.trainerInstructorName = trimStringField(payload.trainerInstructorName);
  payload.trainerImage = trimStringField(payload.trainerImage);
  payload.trainerExperience = trimStringField(payload.trainerExperience);
  payload.languageOfDelivery = trimStringField(payload.languageOfDelivery);
  payload.whatsIncluded = trimStringField(payload.whatsIncluded);
  payload.whatsNotIncluded = trimStringField(payload.whatsNotIncluded);
  payload.learningOutcomes = trimStringField(payload.learningOutcomes);
  payload.courseImage = trimStringField(payload.courseImage);
  payload.courseDemoVideo = trimStringField(payload.courseDemoVideo);
  payload.refundCancellationPolicy = trimStringField(payload.refundCancellationPolicy);
  payload.postCourseSupport = trimStringField(payload.postCourseSupport);
  payload.mobileNo = trimStringField(payload.mobileNo);
  payload.contactForQueries = trimStringField(payload.contactForQueries);

  payload.targetAudience = parseStringArray(payload.targetAudience);

  const uploadedCourseImage = getUploadedPaths(files?.courseImage);
  payload.courseImage =
    uploadedCourseImage.length > 0
      ? uploadedCourseImage[0]
      : trimStringField(payload.courseImage);

  const uploadedTrainerImage = getUploadedPaths(files?.trainerImage);
  payload.trainerImage =
    uploadedTrainerImage.length > 0
      ? uploadedTrainerImage[0]
      : trimStringField(payload.trainerImage);

  const uploadedBrochures = getUploadedPaths(files?.brochurePdfDownload);
  payload.brochurePdfDownload =
    uploadedBrochures.length > 0
      ? uploadedBrochures
      : parseStringArray(payload.brochurePdfDownload);

  return payload;
};

router.get("/next-code", async (_req: Request, res: Response) => {
  try {
    const courseUniqueCode = await getNextCourseCode();
    return res.json({ courseUniqueCode });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to generate course code" });
  }
});

router.post(
  "/",
  upload.fields([
    { name: "courseImage", maxCount: 1 },
    { name: "trainerImage", maxCount: 1 },
    { name: "brochurePdfDownload", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const payload = normalizePayload(req.body, files);

      if (!String(payload.courseName || "").trim()) {
        return res.status(400).json({ message: "Course name is required" });
      }

      const requestedCode = String(payload.courseUniqueCode || "").trim();
      payload.courseUniqueCode = requestedCode || (await getNextCourseCode());

      const existingCourse = await Course.findOne({
        courseUniqueCode: String(payload.courseUniqueCode).trim(),
      });

      if (existingCourse) {
        return res.status(409).json({ message: "Course unique code already exists" });
      }

      const course = new Course({
        ...payload,
        courseName: String(payload.courseName).trim(),
        courseUniqueCode: String(payload.courseUniqueCode).trim(),
      });

      await course.save();
      return res.status(201).json(course);
    } catch (err: any) {
      console.error("Create course error:", err);
      return res.status(500).json({ message: err.message || "Failed to create course" });
    }
  }
);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    return res.json(courses);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to fetch courses" });
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
    return res.status(500).json({ message: err.message || "Failed to fetch course" });
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
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const payload = normalizePayload(req.body, files);

      if (payload.courseUniqueCode) {
        const duplicateCourse = await Course.findOne({
          _id: { $ne: req.params.id },
          courseUniqueCode: String(payload.courseUniqueCode).trim(),
        });

        if (duplicateCourse) {
          return res.status(409).json({ message: "Course unique code already exists" });
        }
      }

      const updatedCourse = await Course.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
      );

      if (!updatedCourse) {
        return res.status(404).json({ message: "Course not found" });
      }

      return res.json(updatedCourse);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to update course" });
    }
  }
);

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deletedCourse = await Course.findByIdAndDelete(req.params.id);

    if (!deletedCourse) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json({ message: "Course deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to delete course" });
  }
});

export default router;
