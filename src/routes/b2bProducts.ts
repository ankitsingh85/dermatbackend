import express, { Request, Response } from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import B2BProduct from "../models/B2BProduct";
import upload from "../middleware/uploads";

const router = express.Router();

const textOnlyRegex = /^[A-Za-z ]+$/;
const digitsOnlyRegex = /^\d+$/;
const isValidUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const stripHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseJsonArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value !== "string" || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean);
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined) => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const getUploadedPath = (files: Express.Multer.File[] | undefined) => {
  if (!files || files.length === 0) return "";
  return `/uploads/${files[0].filename}`;
};

const normalizeNumericFields = (payload: Record<string, unknown>) => {
  // NOTE: "packSize" is intentionally excluded — it now accepts numbers,
  // symbols, and text together (e.g. "10x5 ml", "Box of 24").
  const fields = [
    "pricePerUnit",
    "bulkPriceTier",
    "moq",
    "stockAvailable",
    "mrp",
    "discountedPrice",
    "gst",
  ] as const;

  for (const field of fields) {
    if (payload[field] === undefined) continue;
    if (payload[field] === "") {
      // Optional numeric field left blank — drop it so Mongoose leaves
      // the path unset instead of throwing a cast error on "".
      delete payload[field];
      continue;
    }
    payload[field] = Number(payload[field]);
  }
};

// Optional fields whose schema type would throw a Mongoose cast error
// (Date/format validators) if handed an empty string instead of being
// left unset. Blank input on these now just means "not provided".
const OPTIONAL_FIELDS_TO_DROP_WHEN_BLANK = [
  "hsnCode",
  "brandName",
  "manufacturerName",
  "licenseNumber",
  "productVideoUrl",
  "expiryDate",
] as const;

const dropBlankOptionalFields = (payload: Record<string, unknown>) => {
  for (const field of OPTIONAL_FIELDS_TO_DROP_WHEN_BLANK) {
    if (typeof payload[field] === "string" && !payload[field]) {
      delete payload[field];
    }
  }
};

const normalizeBooleanFields = (payload: Record<string, unknown>) => {
  if (payload.taxIncluded !== undefined) {
    if (typeof payload.taxIncluded === "string") {
      payload.taxIncluded = payload.taxIncluded.toLowerCase() === "true";
    } else {
      payload.taxIncluded = Boolean(payload.taxIncluded);
    }
  }
};

const normalizeB2BPayload = (body: Record<string, unknown>) => {
  const payload: Record<string, unknown> = { ...body };
  normalizeNumericFields(payload);
  dropBlankOptionalFields(payload);
  normalizeBooleanFields(payload);

  const promotionalTags = parseJsonArray(payload.promotionalTags);
  if (promotionalTags) {
    payload.promotionalTags = promotionalTags;
  }

  // Category is now multi-select — always normalize to a string array.
  const category = parseJsonArray(payload.category);
  if (category) {
    payload.category = category;
  }

  return payload;
};

const friendlyFieldNames: Record<string, string> = {
  productName: "Product name",
  category: "Category",
  hsnCode: "HSN code",
  brandName: "Brand name",
  packSize: "Pack size",
  pricePerUnit: "Price per unit",
  bulkPriceTier: "Bulk price tier",
  moq: "MOQ",
  stockAvailable: "Stock available",
  expiryDate: "Expiry date",
  shelfLife: "Shelf life",
  description: "Description",
  ingredients: "Ingredients",
  usageInstructions: "Usage instructions",
  treatmentIndications: "Treatment indications",
  manufacturerName: "Manufacturer name",
  licenseNumber: "License number",
  mrp: "MRP",
  discountedPrice: "Discounted price",
  productVideoUrl: "Product video URL",
  productImages: "Product images",
  gst: "GST %",
};

// Only productName, category and discountedPrice are mandatory to create
// a B2B product — everything else is optional and, if provided, is still
// format-checked below (but never required).
const validateB2BPayload = (
  payload: Record<string, unknown>,
  isCreate = false
) => {
  if (isCreate && !stripHtml(payload.productName)) {
    return { message: `${friendlyFieldNames.productName} is required` };
  }

  if (
    isCreate &&
    (!payload.category ||
      !Array.isArray(payload.category) ||
      !payload.category.length)
  ) {
    return { message: "At least one category is required" };
  }

  if (
    isCreate &&
    (payload.discountedPrice === undefined ||
      payload.discountedPrice === null ||
      payload.discountedPrice === "")
  ) {
    return { message: `${friendlyFieldNames.discountedPrice} is required` };
  }

  if (
    payload.productName !== undefined &&
    !textOnlyRegex.test(stripHtml(payload.productName))
  ) {
    return {
      message: "Product name should contain only letters and spaces",
    };
  }

  if (payload.brandName !== undefined && !textOnlyRegex.test(stripHtml(payload.brandName))) {
    return {
      message: "Brand name should contain only letters and spaces",
    };
  }

  if (
    payload.manufacturerName !== undefined &&
    !textOnlyRegex.test(stripHtml(payload.manufacturerName))
  ) {
    return {
      message: "Manufacturer name should contain only letters and spaces",
    };
  }

  if (payload.hsnCode !== undefined && !digitsOnlyRegex.test(stripHtml(payload.hsnCode))) {
    return { message: "HSN code must contain digits only" };
  }

  const numericFieldsIfProvided = [
    "pricePerUnit",
    "bulkPriceTier",
    "moq",
    "stockAvailable",
    "mrp",
    "discountedPrice",
  ] as const;

  for (const field of numericFieldsIfProvided) {
    if (payload[field] !== undefined && Number.isNaN(Number(payload[field]))) {
      return { message: `${friendlyFieldNames[field]} must be a valid number` };
    }
  }

  if (
    payload.bulkPriceTier !== undefined &&
    !digitsOnlyRegex.test(String(payload.bulkPriceTier).trim())
  ) {
    return { message: "Bulk price tier must contain digits only" };
  }

  if (payload.licenseNumber !== undefined && !digitsOnlyRegex.test(stripHtml(payload.licenseNumber))) {
    return { message: "License number must contain digits only" };
  }

  if (payload.productVideoUrl !== undefined && !isValidUrl(payload.productVideoUrl)) {
    return { message: "Product video URL must be a valid URL" };
  }

  // GST is a free-form percentage (0-100) instead of a fixed enum, to
  // support the dropdown-presets + "Custom" text field on the frontend.
  // It's optional — the schema defaults to 5 when omitted.
  if (payload.gst !== undefined) {
    const gstValue = Number(payload.gst);
    if (Number.isNaN(gstValue) || gstValue < 0 || gstValue > 100) {
      return { message: "GST % must be a valid number between 0 and 100" };
    }
  }

  return null;
};

/* ================= SKU GENERATOR =================
   Format: B2BProd-<YYYYMM>-<N>
   e.g. "B2BProd-202606-1", "B2BProd-202606-2", "B2BProd-202606-3" ...
   "B2BProd" is a fixed prefix. The sequence number increments dynamically
   per month, across all B2B products.
*/
const SKU_PREFIX_LABEL = "B2BProd";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generateNextB2BSku = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const prefix = `${SKU_PREFIX_LABEL}-${year}${month}-`;
  const escapedPrefix = escapeRegExp(prefix);

  const existing = await B2BProduct.find({
    sku: { $regex: `^${escapedPrefix}\\d+$` },
  }).select("sku");

  let maxSeq = 0;
  const seqRegex = new RegExp(`^${escapedPrefix}(\\d+)$`);

  for (const product of existing) {
    const match = product.sku?.match(seqRegex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return `${prefix}${maxSeq + 1}`;
};

/* ================= CREATE ================= */
router.post(
  "/",
  upload.fields([
    { name: "productImages", maxCount: 10 },
    { name: "msds", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizeB2BPayload(req.body as Record<string, unknown>);
      const uploadedImages = getUploadedPaths(files?.productImages);
      const uploadedMsds = getUploadedPath(files?.msds);
      const parsedImages = parseJsonArray(payload.productImages);

      if (uploadedImages.length > 0) {
        payload.productImages = uploadedImages;
      } else if (parsedImages) {
        payload.productImages = parsedImages;
      }

      if (uploadedMsds) {
        const msdsFile = files?.msds?.[0];
        if (msdsFile?.mimetype !== "application/pdf") {
          return res.status(400).json({
            message: "MSDS / Product Datasheet must be a PDF file",
          });
        }
        payload.msds = uploadedMsds;
      }

      // SKU is now auto-generated on the backend in the format
      // B2BProd-YYYYMM-N, ignoring whatever (if anything) the client sent.
      payload.sku = await generateNextB2BSku();

      const validationError = validateB2BPayload(payload, true);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const product = new B2BProduct({
        ...payload,
      });

      await product.save();
      res.status(201).json(product);
    } catch (err: any) {
      console.error("B2B create error:", err);

      if (err?.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || "field";
        const value = err.keyValue?.[field];
        return res.status(400).json({
          message: `A product with this ${field} already exists (${value}).`,
          error: err.message,
        });
      }

      res.status(500).json({ message: err.message });
    }
  }
);

/* ================= BULK CREATE ================= */

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

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

const readB2BProductRows = (filePath: string) => {
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

// Every column here matches a field on the manual "Create B2B Product"
// form (CreateB2BProduct.tsx) 1:1 — sku is the only exception, since it's
// always auto-generated, on the manual form too. category, productImages,
// and promotionalTags accept comma-separated values in one cell (the
// shared normalizeB2BPayload below already falls back to comma-splitting
// when a cell isn't valid JSON).
const B2B_PRODUCT_BULK_FIELD_HEADERS: Record<string, string[]> = {
  productName: ["productname", "name"],
  category: ["category", "categories", "categoryname", "productcategory", "productcategories"],
  subCategory: ["subcategory"],
  hsnCode: ["hsncode", "hsn"],
  brandName: ["brandname", "brand"],
  packSize: ["packsize"],
  pricePerUnit: ["priceperunit"],
  bulkPriceTier: ["bulkpricetier"],
  moq: ["moq"],
  stockAvailable: ["stockavailable", "stock"],
  expiryDate: ["expirydate"],
  shelfLife: ["shelflife"],
  description: ["description"],
  ingredients: ["ingredients"],
  usageInstructions: ["usageinstructions"],
  treatmentIndications: ["treatmentindications"],
  certifications: ["certifications"],
  manufacturerName: ["manufacturername", "manufacturer"],
  licenseNumber: ["licensenumber", "license"],
  mrp: ["mrp"],
  discountedPrice: ["discountedprice", "price"],
  gst: ["gst", "gstpercent", "tax"],
  taxIncluded: ["taxincluded"],
  productImages: ["productimages", "images"],
  productVideoUrl: ["productvideourl", "videourl", "video"],
  msds: ["msds"],
  customerReviews: ["customerreviews", "reviews"],
  relatedProducts: ["relatedproducts"],
  promotionalTags: ["promotionaltags", "tags"],
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

    const rows = readB2BProductRows(req.file.path);
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
      for (const [field, headers] of Object.entries(B2B_PRODUCT_BULK_FIELD_HEADERS)) {
        const value = getCell(row, headers);
        if (value) body[field] = value;
      }
      if (body.expiryDate) {
        const parsedExpiry = parseDateOnly(body.expiryDate);
        if (parsedExpiry) body.expiryDate = parsedExpiry;
        else delete body.expiryDate;
      }

      const payload = normalizeB2BPayload(body);
      payload.sku = await generateNextB2BSku();

      const validationError = validateB2BPayload(payload, true);
      if (validationError) {
        skipped.push({ row: rowNumber, reason: validationError.message });
        continue;
      }

      try {
        const product = await B2BProduct.create(payload);
        created.push(product);
      } catch (err: any) {
        let reason = err.message || "Failed to create B2B product";
        if (err?.code === 11000) {
          const field = Object.keys(err.keyValue || {})[0] || "field";
          reason = `A product with this ${field} already exists (${err.keyValue?.[field]}).`;
        }
        skipped.push({ row: rowNumber, reason });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid B2B products found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} B2B products uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

/* ================= LIST ================= */
router.get("/", async (_req, res) => {
  const products = await B2BProduct.find().sort({ createdAt: -1 });
  res.json(products);
});

/* ================= UPDATE ================= */
router.put(
  "/:id",
  upload.fields([
    { name: "productImages", maxCount: 10 },
    { name: "msds", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const { _id, createdAt, updatedAt, sku, ...updateData } = req.body;
      const payload = normalizeB2BPayload(updateData as Record<string, unknown>);
      const uploadedImages = getUploadedPaths(files?.productImages);
      const uploadedMsds = getUploadedPath(files?.msds);
      const parsedImages = parseJsonArray(payload.productImages);

      if (uploadedImages.length > 0) {
        payload.productImages = uploadedImages;
      } else if (parsedImages) {
        payload.productImages = parsedImages;
      }

      if (uploadedMsds) {
        const msdsFile = files?.msds?.[0];
        if (msdsFile?.mimetype !== "application/pdf") {
          return res.status(400).json({
            message: "MSDS / Product Datasheet must be a PDF file",
          });
        }
        payload.msds = uploadedMsds;
      }

      const validationError = validateB2BPayload(payload, false);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const updated = await B2BProduct.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "B2B product not found" });
      }

      res.json(updated);
    } catch (err: any) {
      console.error("B2B update error:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  await B2BProduct.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

export default router;