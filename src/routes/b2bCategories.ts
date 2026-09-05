import express, { Request, Response } from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import B2BCategory from "../models/B2BCategory";
import upload from "../middleware/uploads";

const router = express.Router();

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim() || (!uploadedImageUrl && !legacyImageUrl)) {
      return res.status(400).json({ message: "Name and image are required" });
    }

    const category = await B2BCategory.create({
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });
    res.status(201).json(category);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await B2BCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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

const readB2BCategoryRows = (filePath: string) => {
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

    const rows = readB2BCategoryRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const name = getCell(row, ["name", "b2bcategoryname", "b2bcategory", "category"]);
      const imageUrl = getCell(row, ["imageurl", "image", "b2bcategoryimage"]);

      if (!name) {
        skipped.push({ row: rowNumber, reason: "Category name is required" });
        continue;
      }
      if (!imageUrl) {
        skipped.push({ row: rowNumber, reason: "Image URL is required" });
        continue;
      }

      try {
        const category = await B2BCategory.create({ name, imageUrl });
        created.push(category);
      } catch (err: any) {
        let reason = err.message || "Failed to create category";
        if (err?.code === 11000) {
          reason = `A B2B category named "${name}" already exists.`;
        }
        skipped.push({ row: rowNumber, reason });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid B2B categories found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} B2B categories uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    const updateData: Record<string, string> = {};
    if (name?.trim()) updateData.name = String(name).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await B2BCategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await B2BCategory.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
