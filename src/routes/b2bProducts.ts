import express, { Request, Response } from "express";
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