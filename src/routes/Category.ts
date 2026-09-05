import express from "express";
import Category from "../models/Category";
import upload from "../middleware/uploads";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";

const router = express.Router();

const getUploadedPath = (file: Express.Multer.File | undefined) => {
  if (!file) return undefined;
  return `/uploads/${file.filename}`;
};

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getCell = (row: Record<string, unknown>, headers: string[]) => {
  for (const header of headers) {
    const foundKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
    if (foundKey) return String(row[foundKey] || "").trim();
  }
  return "";
};

const getNextCategoryNumber = async () => {
  const categories = await Category.find({ id: /^cat-\d+$/ }).select("id").lean();
  return categories.reduce((max, category) => {
    const num = Number.parseInt(String(category.id).split("-")[1], 10);
    return Number.isFinite(num) ? Math.max(max, num) : max;
  }, 0) + 1;
};

const readCategoryRows = (filePath: string) => {
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

/* ================= GET ALL ================= */
router.get("/", async (_req, res) => {
  try {
    const categories = await Category.find({})
      .select("id name imageUrl")
      .lean();

    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= CREATE ================= */
router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name, imageUrl } = req.body;
    const uploadedImageUrl = getUploadedPath(req.file);
    if (!name) {
      return res.status(400).json({ message: "name required" });
    }
    if (!uploadedImageUrl && !(typeof imageUrl === "string" && imageUrl.trim())) {
      return res.status(400).json({ message: "imageUrl required" });
    }

    const last = await Category.findOne({}).sort({ createdAt: -1 }).lean();
    let newId = "cat-1";
    if (last?.id) {
      const num = parseInt(last.id.split("-")[1], 10);
      newId = `cat-${num + 1}`;
    }

    const category = new Category({
      id: newId,
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || String(imageUrl || "").trim(),
    });

    await category.save();
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= BULK CREATE ================= */
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

    const rows = readCategoryRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    let nextNumber = await getNextCategoryNumber();
    const skipped: { row: number; reason: string }[] = [];
    const categories = rows
      .map((row, index) => {
        const name = getCell(row, ["name", "categoryname", "category"]);
        const imageUrl = getCell(row, ["imageurl", "image", "categoryimage", "categoryimageurl"]);

        if (!name) {
          skipped.push({ row: index + 2, reason: "Category name is required" });
          return null;
        }

        if (!imageUrl) {
          skipped.push({ row: index + 2, reason: "Image URL is required" });
          return null;
        }

        return {
          id: `cat-${nextNumber++}`,
          name,
          imageUrl,
        };
      })
      .filter((category): category is { id: string; name: string; imageUrl: string } =>
        Boolean(category)
      );

    if (!categories.length) {
      return res.status(400).json({
        message: "No valid categories found in uploaded file",
        skipped,
      });
    }

    const created = await Category.insertMany(categories, { ordered: false });

    res.status(201).json({
      message: `${created.length} categories uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

/* ================= UPDATE ================= */
router.put("/:mongoId", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name, imageUrl } = req.body;
    const uploadedImageUrl = getUploadedPath(req.file);

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (uploadedImageUrl) {
      updateData.imageUrl = uploadedImageUrl;
    } else if (typeof imageUrl === "string" && imageUrl.trim()) {
      updateData.imageUrl = imageUrl.trim();
    }

    const updated = await Category.findByIdAndUpdate(
      req.params.mongoId,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= DELETE ================= */
router.delete("/:mongoId", async (req, res) => {
  try {
    const deleted = await Category.findByIdAndDelete(req.params.mongoId);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ message: "Category deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
