import express from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import ClinicCategory from "../models/clinicCategory";
import upload from "../middleware/uploads";

const router = express.Router();

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generateClinicCategoryCode = async () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const prefix = `ClncCgry-${year}${month}`;

  const lastCategory = await ClinicCategory.findOne({
    categoryId: {
      $regex: `^${prefix}`,
    },
  }).sort({ createdAt: -1 });

  let count = 1;

  if (lastCategory?.categoryId) {
    const lastCount = Number(lastCategory.categoryId.split("-")[2]);

    if (!Number.isNaN(lastCount)) {
      count = lastCount + 1;
    }
  }

  return `${prefix}-${count}`;
};

router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "Category image is required" });
    }

    const existing = await ClinicCategory.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i") },
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "Clinic category already exists" });
    }

  const categoryId = await generateClinicCategoryCode();

    const category = new ClinicCategory({
      categoryId,
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating clinic category:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const categories = await ClinicCategory.find()
      .select("categoryId name imageUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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

const readClinicCategoryRows = (filePath: string) => {
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

    const rows = readClinicCategoryRows(req.file.path);
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

      const name = getCell(row, ["name", "cliniccategoryname", "cliniccategory"]);
      const imageUrl = getCell(row, ["imageurl", "image", "cliniccategoryimage"]);

      if (!name) {
        skipped.push({ row: rowNumber, reason: "Clinic category name is required" });
        continue;
      }
      if (!imageUrl) {
        skipped.push({ row: rowNumber, reason: "Image URL is required" });
        continue;
      }

      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) {
        skipped.push({ row: rowNumber, reason: "Duplicate clinic category name in this file" });
        continue;
      }

      const existing = await ClinicCategory.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
      }).lean();
      if (existing) {
        skipped.push({ row: rowNumber, reason: "Clinic category already exists" });
        continue;
      }

      try {
        const category = await ClinicCategory.create({
          categoryId: await generateClinicCategoryCode(),
          name,
          imageUrl,
        });
        seenNames.add(nameKey);
        created.push(category);
      } catch (err: any) {
        skipped.push({ row: rowNumber, reason: err.message || "Failed to create clinic category" });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid clinic categories found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} clinic categories uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const duplicate = await ClinicCategory.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i") },
    }).lean();

    if (duplicate) {
      return res.status(409).json({ message: "Clinic category already exists" });
    }

    const updateData: Record<string, string> = {
      name: String(name).trim(),
    };

    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await ClinicCategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating clinic category:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await ClinicCategory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting clinic category:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
