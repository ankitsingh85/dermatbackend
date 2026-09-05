import express, { Request, Response } from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
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

// Parses a date-only string as UTC midnight, accepting both "YYYY-MM-DD"
// and "M/D/YYYY" (with or without leading zeros). Plain `new Date(string)`
// treats anything other than strict ISO "YYYY-MM-DD" as LOCAL midnight —
// on a positive-UTC-offset server (e.g. IST) that silently shifts the
// stored date back a day for "M/D/YYYY" input, so both accepted formats
// are parsed explicitly here instead of trusting the ambient timezone.
const parseDateOnly = (value: unknown): Date | undefined => {
  const str = String(value ?? "").trim();
  if (!str) return undefined;

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const date = new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
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

    const parsedDate = parseDateOnly(value);

    payload[field] = parsedDate ?? "INVALID_DATE";
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

  // Optional fields with a schema-level enum/format validator would throw
  // on an empty string instead of being left unset. Blank input on these
  // now just means "not provided".
  const dropIfBlank = [
    "certificationProvided",
    "languageOfDelivery",
    "trainerInstructorName",
    "mobileNo",
    "courseDemoVideo",
  ];
  dropIfBlank.forEach((field) => {
    if (typeof payload[field] === "string" && !payload[field]) {
      delete payload[field];
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

// Only courseName, instituteName and netFeesInr are mandatory to create a
// course — everything else is optional and, if provided, is still
// format-checked below (but never required).
const validateCoursePayload = (
  payload: Record<string, unknown>,
  isCreate = false,
) => {
  const requiredTextFields = ["courseName", "instituteName"] as const;

  for (const field of requiredTextFields) {
    if (isCreate && !stripHtml(payload[field])) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} is required`,
      };
    }
  }

  if (
    isCreate &&
    (payload.netFeesInr === undefined ||
      payload.netFeesInr === null ||
      payload.netFeesInr === "")
  ) {
    return { message: "Net fees inr is required" };
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

  const numberFieldsIfProvided = [
    "feesInr",
    "netFeesInr",
    "discountPercent",
    "maximumSeatsBatchSize",
  ] as const;

  for (const field of numberFieldsIfProvided) {
    if (payload[field] === undefined) continue;

    if (Number.isNaN(Number(payload[field]))) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} must be a valid number`,
      };
    }

    if (!Number.isInteger(Number(payload[field]))) {
      return {
        message: `${String(field).replace(/([A-Z])/g, " $1")} must contain digits only`,
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
    payload.mobileNo !== undefined &&
    !digitsOnlyRegex.test(String(payload.mobileNo))
  ) {
    return { message: "Mobile number must contain digits only" };
  }

  if (
    payload.mobileNo !== undefined &&
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
    payload.targetAudience !== undefined &&
    !Array.isArray(payload.targetAudience)
  ) {
    return { message: "Target audience must be a valid list" };
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

/* ================= BULK CREATE ================= */

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getCell = (row: Record<string, unknown>, headers: string[]) => {
  for (const header of headers) {
    const foundKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
    if (foundKey) {
      const raw = row[foundKey];
      // A cell XLSX parsed as a date (cellDates:true) comes back as a Date
      // object — stringify it as ISO rather than via Date#toString(), which
      // is locale/timezone-formatted text that isn't reliably re-parseable.
      if (raw instanceof Date) return raw.toISOString();
      return String(raw ?? "").trim();
    }
  }
  return "";
};

const readCourseRows = (filePath: string) => {
  if (filePath.toLowerCase().endsWith(".csv")) {
    return parseCsvRows(fs.readFileSync(filePath));
  }
  // cellDates:true — converts a genuine Excel date-serial cell into a JS
  // Date instead of a raw serial number.
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
  });
};

// Every column here matches a field on the manual "Create Course" form
// (CreateCourse.tsx) 1:1 — courseUniqueCode is the only exception, since
// that's always auto-generated, same as on the manual form.
const COURSE_BULK_FIELD_HEADERS: Record<string, string[]> = {
  courseName: ["coursename", "name"],
  hsnCode: ["hsncode", "hsn"],
  discountPercent: ["discountpercent", "discount"],
  instituteName: ["institutename", "institute"],
  courseDuration: ["courseduration", "duration"],
  modeOfTraining: ["modeoftraining", "mode"],
  startDate: ["startdate"],
  endDate: ["enddate"],
  registrationDeadline: ["registrationdeadline", "deadline"],
  curriculumTopicsCovered: ["curriculumtopicscovered", "curriculum"],
  certificationProvided: ["certificationprovided", "certification"],
  affiliationAccreditation: ["affiliationaccreditation", "affiliation"],
  feesInr: ["feesinr", "fees"],
  applyDiscountVoucher: ["applydiscountvoucher", "discountvoucher"],
  netFeesInr: ["netfeesinr", "netfees"],
  discountsOffers: ["discountsoffers", "offers"],
  location: ["location"],
  maximumSeatsBatchSize: ["maximumseatsbatchsize", "seats", "batchsize"],
  currentAvailability: ["currentavailability", "availability"],
  trainerInstructorName: ["trainerinstructorname", "trainername"],
  trainerImage: ["trainerimage", "trainerimageurl"],
  trainerExperience: ["trainerexperience"],
  languageOfDelivery: ["languageofdelivery", "language"],
  whatsIncluded: ["whatsincluded", "included"],
  whatsNotIncluded: ["whatsnotincluded", "notincluded"],
  learningOutcomes: ["learningoutcomes", "outcomes"],
  courseImage: ["courseimage", "courseimageurl", "image"],
  courseDemoVideo: ["coursedemovideo", "demovideo", "video"],
  refundCancellationPolicy: ["refundcancellationpolicy", "refundpolicy"],
  postCourseSupport: ["postcoursesupport", "support"],
  mobileNo: ["mobileno", "mobile", "phone"],
  contactForQueries: ["contactforqueries", "contact"],
};

router.post("/bulk-upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV or Excel file required" });
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xls", "xlsx"].includes(ext)) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: "Only CSV, XLS, or XLSX files are allowed" });
    }

    const rows = readCourseRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }


    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const body: Record<string, unknown> = {};
      for (const [field, headers] of Object.entries(COURSE_BULK_FIELD_HEADERS)) {
        const value = getCell(row, headers);
        if (value) body[field] = value;
      }

      // courseType is stored as plain name strings (matching the manual
      // "Create Course" form via normalizePayload's parseStringArray below),
      // not CourseType _ids — no existence lookup needed here.
      const courseTypeRaw = getCell(row, ["coursetype", "coursetypes"]);
      if (courseTypeRaw) {
        body.courseType = courseTypeRaw;
      }

      const targetAudienceRaw = getCell(row, ["targetaudience", "audience"]);
      if (targetAudienceRaw) {
        body.targetAudience = targetAudienceRaw
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
      }

      const brochureRaw = getCell(row, ["brochurepdfdownload", "brochure", "brochureurls"]);
      if (brochureRaw) {
        body.brochurePdfDownload = brochureRaw
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean);
      }

      const payload = normalizePayload(body);
      const validationError = validateCoursePayload(payload, true);
      if (validationError) {
        skipped.push({ row: rowNumber, reason: validationError.message });
        continue;
      }

      try {
        payload.courseUniqueCode = await generateCourseUniqueCode();
        const course = await Course.create({
          ...payload,
          courseName: String(payload.courseName).trim(),
          courseUniqueCode: String(payload.courseUniqueCode).trim(),
        });
        created.push(course);
      } catch (err: any) {
        skipped.push({ row: rowNumber, reason: err.message || "Failed to create course" });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid courses found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} courses uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

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