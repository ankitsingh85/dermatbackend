import express, { Request, Response } from "express";
import upload from "../middleware/uploads";
import Product from "../models/Products";

const router = express.Router();

const textOnlyRegex = /^[A-Za-z ]+$/;
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

const normalizeNumericFields = (payload: Record<string, unknown>) => {
  if (payload.mrpPrice !== undefined) payload.mrpPrice = Number(payload.mrpPrice);
  if (payload.discountedPrice !== undefined) {
    payload.discountedPrice = Number(payload.discountedPrice);
  }
  if (payload.discountPercent !== undefined) {
    payload.discountPercent = Number(payload.discountPercent);
  }
  if (payload.taxPercent !== undefined) payload.taxPercent = Number(payload.taxPercent);
};

const normalizeProductPayload = (
  req: Request,
  files?: { [fieldname: string]: Express.Multer.File[] }
) => {
  const payload: Record<string, unknown> = { ...req.body };
  normalizeNumericFields(payload);

  const uploadedProductImages = getUploadedPaths(files?.productImages);
  const parsedProductImages = parseJsonArray(payload.productImages);

  if (uploadedProductImages.length > 0) {
    payload.productImages = uploadedProductImages;
  } else if (parsedProductImages) {
    payload.productImages = parsedProductImages;
  }

  return payload;
};

const friendlyFieldNames: Record<string, string> = {
  productName: "Product name",
  category: "Category",
  brandName: "Brand name",
  description: "Description",
  ingredients: "Ingredients",
  targetConcerns: "Target concerns",
  usageInstructions: "Usage instructions",
  expiryDate: "Expiry date",
  manufacturerName: "Manufacturer name",
  licenseNumber: "License number",
  packagingType: "Packaging type",
  skinHairType: "Skin / hair type",
  barcode: "Barcode",
  netQuantity: "Net quantity",
  mrpPrice: "MRP price",
  discountedPrice: "Discounted price",
  discountPercent: "Discount percent",
  taxPercent: "Tax percent",
  productShortVideo: "Product short video",
  productImages: "Product images",
};

const validateProductPayload = (
  payload: Record<string, unknown>,
  isCreate = false
) => {
  const requiredTextFields = [
    "productName",
    "category",
    "brandName",
    "description",
    "ingredients",
    "targetConcerns",
    "usageInstructions",
    "expiryDate",
    "manufacturerName",
    "licenseNumber",
    "packagingType",
    "skinHairType",
    "barcode",
  ] as const;

  for (const field of requiredTextFields) {
    const value = stripHtml(payload[field]);
    if (isCreate && !value.trim()) {
      return { message: `${friendlyFieldNames[field]} is required` };
    }
  }

  if (payload.productName !== undefined && !textOnlyRegex.test(stripHtml(payload.productName))) {
    return { message: "Product name should contain only letters and spaces" };
  }

  if (payload.brandName !== undefined && !textOnlyRegex.test(stripHtml(payload.brandName))) {
    return { message: "Brand name should contain only letters and spaces" };
  }

  if (
    payload.manufacturerName !== undefined &&
    !textOnlyRegex.test(stripHtml(payload.manufacturerName))
  ) {
    return {
      message: "Manufacturer name should contain only letters and spaces",
    };
  }

  if (payload.packagingType !== undefined && !textOnlyRegex.test(stripHtml(payload.packagingType))) {
    return { message: "Packaging type should contain only letters and spaces" };
  }

  if (payload.licenseNumber !== undefined && !/^\d+$/.test(stripHtml(payload.licenseNumber))) {
    return { message: "License number must contain digits only" };
  }

  if (payload.productShortVideo !== undefined && !isValidUrl(payload.productShortVideo)) {
    return { message: "Product short video must be a valid URL" };
  }

  if (
    isCreate &&
    (!payload.productImages ||
      !Array.isArray(payload.productImages) ||
      !payload.productImages.length)
  ) {
    return { message: "At least one product image is required" };
  }

  const numericFields = ["netQuantity", "mrpPrice", "discountedPrice", "discountPercent", "taxPercent"] as const;
  for (const field of numericFields) {
    if (isCreate && (payload[field] === undefined || payload[field] === null || payload[field] === "")) {
      return { message: `${friendlyFieldNames[field]} is required` };
    }
    if (payload[field] !== undefined && Number.isNaN(Number(payload[field]))) {
      return { message: `${friendlyFieldNames[field]} must be a valid number` };
    }
  }

  return null;
};

/** ================= CREATE PRODUCT ================= */
router.post(
  "/",
  upload.fields([{ name: "productImages", maxCount: 10 }]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizeProductPayload(req, files);
      payload.productSKU = String(payload.productSKU || `SKU-${Date.now().toString().slice(-6)}`);
      const validationError = validateProductPayload(payload, true);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const product = new Product({
        ...payload,
        // subCategory: undefined intentionally ignored
      });

      await product.save();
      res.status(201).json(product);
    } catch (err: any) {
      console.error("Create product error:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/** ================= GET ALL ================= */
router.get("/", async (_req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

/** ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(product);
});

/** ================= UPDATE ================= */
router.put(
  "/:id",
  upload.fields([{ name: "productImages", maxCount: 10 }]),
  async (req, res) => {
    try {
      const files = req.files as
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined;
      const payload = normalizeProductPayload(req, files);
      const validationError = validateProductPayload(payload, false);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const updated = await Product.findByIdAndUpdate(
        req.params.id,
        {
          ...payload,
          // subCategory: undefined intentionally ignored
        },
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(updated);
    } catch (err: any) {
      console.error("Update product error:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/** ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/** ================= ADD REVIEW ================= */
router.post("/:id/reviews", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Not found" });

  product.reviews.push(req.body);

  const total = product.reviews.reduce((a, r) => a + r.rating, 0);
  product.rating = total / product.reviews.length;

  await product.save();
  res.json(product);
});

export default router;
