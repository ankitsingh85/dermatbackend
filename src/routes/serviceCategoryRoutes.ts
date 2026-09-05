import express, { Request, Response } from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import ServiceCategory from "../models/serviceCategory";
import upload from "../middleware/uploads";

const router = express.Router();

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "imageUrl is required" });
    }

    const category = new ServiceCategory({
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: "Failed to create service category", error: err });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await ServiceCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch service categories", error: err });
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

const readServiceCategoryRows = (filePath: string) => {
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

    const rows = readServiceCategoryRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const name = getCell(row, ["name", "servicecategoryname", "servicecategory", "category"]);
      const imageUrl = getCell(row, ["imageurl", "image", "servicecategoryimage"]);

      if (!name) {
        skipped.push({ row: rowNumber, reason: "Name is required" });
        continue;
      }
      if (!imageUrl) {
        skipped.push({ row: rowNumber, reason: "imageUrl is required" });
        continue;
      }

      try {
        const category = await ServiceCategory.create({ name, imageUrl });
        created.push(category);
      } catch (err: any) {
        skipped.push({ row: rowNumber, reason: err.message || "Failed to create service category" });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid service categories found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} service categories uploaded successfully`,
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

    const category = await ServiceCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Service category not found" });

    if (name?.trim()) category.name = String(name).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      category.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await category.save();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update service category", error: err });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const category = await ServiceCategory.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Service category not found" });

    res.json({ message: "Service category deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete service category", error: err });
  }
});

export default router;
