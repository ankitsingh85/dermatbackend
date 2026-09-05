import express from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import CourseType from "../models/courseType";
import upload from "../middleware/uploads";

const router = express.Router();
const generateCourseTypeCode = async () => {

  const now = new Date();

  const year = now.getFullYear();

  const month = String(now.getMonth() + 1).padStart(2, "0");

  const prefix = `CourType-${year}${month}`;

  const lastCourseType = await CourseType.findOne({
    id: {
      $regex: `^${prefix}`,
    },
  }).sort({ createdAt: -1 });

  let count = 1;

  if (lastCourseType?.id) {
    const lastCount = Number(lastCourseType.id.split("-")[2]);

    if (!Number.isNaN(lastCount)) {
      count = lastCount + 1;
    }
  }

  return `${prefix}-${count}`;
};
router.get("/", async (_req, res) => {
  try {
    const courseTypes = await CourseType.find({})
      .select("id name imageUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(courseTypes);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch course types" });
  }
});

router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim() || (!uploadedImageUrl && !legacyImageUrl)) {
      return res.status(400).json({ message: "name and imageUrl required" });
    }

    const existing = await CourseType.findOne({
      name: { $regex: new RegExp(`^${String(name).trim()}$`, "i") },
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "Course type already exists" });
    }

 

   const courseTypeCode = await generateCourseTypeCode();

const courseType = new CourseType({
  id: courseTypeCode,
  name: String(name).trim(),
  imageUrl: uploadedImageUrl || legacyImageUrl,
});
    await courseType.save();
    res.status(201).json(courseType);
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to create course type" });
  }
});

/* ================= BULK CREATE ================= */

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getCell = (row: Record<string, unknown>, headers: string[]) => {
  for (const header of headers) {
    const foundKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
    if (foundKey) return String(row[foundKey] ?? "").trim();
  }
  return "";
};

const readCourseTypeRows = (filePath: string) => {
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

router.post("/bulk-upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV or Excel file required" });
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xls", "xlsx"].includes(ext)) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: "Only CSV, XLS, or XLSX files are allowed" });
    }

    const rows = readCourseTypeRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];
    const seenNames = new Set<string>();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const name = getCell(row, ["name", "coursetypename", "coursetype"]);
      const imageUrl = getCell(row, ["imageurl", "image", "coursetypeimage"]);

      if (!name) {
        skipped.push({ row: rowNumber, reason: "Course type name is required" });
        continue;
      }
      if (!imageUrl) {
        skipped.push({ row: rowNumber, reason: "Image URL is required" });
        continue;
      }

      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) {
        skipped.push({ row: rowNumber, reason: "Duplicate course type name in this file" });
        continue;
      }

      const existing = await CourseType.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
      }).lean();
      if (existing) {
        skipped.push({ row: rowNumber, reason: "Course type already exists" });
        continue;
      }

      try {
        const courseType = await CourseType.create({
          id: await generateCourseTypeCode(),
          name,
          imageUrl,
        });
        seenNames.add(nameKey);
        created.push(courseType);
      } catch (err: any) {
        skipped.push({ row: rowNumber, reason: err.message || "Failed to create course type" });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid course types found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} course types uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

router.put("/:mongoId", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Course type name is required" });
    }

    const duplicate = await CourseType.findOne({
      _id: { $ne: req.params.mongoId },
      name: { $regex: new RegExp(`^${String(name).trim()}$`, "i") },
    }).lean();

    if (duplicate) {
      return res.status(409).json({ message: "Course type already exists" });
    }

    const updateData: Record<string, string> = {
      name: String(name).trim(),
    };

    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await CourseType.findByIdAndUpdate(
      req.params.mongoId,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Course type not found" });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to update course type" });
  }
});

router.delete("/:mongoId", async (req, res) => {
  try {
    const deleted = await CourseType.findByIdAndDelete(req.params.mongoId);
    if (!deleted) {
      return res.status(404).json({ message: "Course type not found" });
    }

    res.json({ message: "Course type deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete course type" });
  }
});

export default router;
