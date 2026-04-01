import express, { Request, Response } from "express";
import B2BProduct from "../models/B2BProduct";

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

const normalizeNumericFields = (payload: Record<string, unknown>) => {
  const fields = [
    "packSize",
    "pricePerUnit",
    "bulkPriceTier",
    "moq",
    "stockAvailable",
    "mrp",
    "discountedPrice",
    "gst",
  ] as const;

  for (const field of fields) {
    if (payload[field] !== undefined && payload[field] !== "") {
      payload[field] = Number(payload[field]);
    }
  }
};

const normalizeB2BPayload = (body: Record<string, unknown>) => {
  const payload: Record<string, unknown> = { ...body };
  normalizeNumericFields(payload);

  const parsedImages = parseJsonArray(payload.productImages);
  if (parsedImages) {
    payload.productImages = parsedImages;
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
};

const validateB2BPayload = (
  payload: Record<string, unknown>,
  isCreate = false
) => {
  const requiredTextFields = [
    "productName",
    "category",
    "hsnCode",
    "brandName",
    "expiryDate",
    "description",
    "ingredients",
    "usageInstructions",
    "treatmentIndications",
    "manufacturerName",
    "licenseNumber",
    "productVideoUrl",
  ] as const;

  for (const field of requiredTextFields) {
    if (isCreate && !stripHtml(payload[field])) {
      return { message: `${friendlyFieldNames[field]} is required` };
    }
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

  const requiredNumericFields = [
    "packSize",
    "pricePerUnit",
    "bulkPriceTier",
    "moq",
    "stockAvailable",
    "mrp",
    "discountedPrice",
  ] as const;

  for (const field of requiredNumericFields) {
    if (isCreate && (payload[field] === undefined || payload[field] === null || payload[field] === "")) {
      return { message: `${friendlyFieldNames[field]} is required` };
    }
    if (payload[field] !== undefined && Number.isNaN(Number(payload[field]))) {
      return { message: `${friendlyFieldNames[field]} must be a valid number` };
    }
  }

  if (
    payload.packSize !== undefined &&
    !digitsOnlyRegex.test(String(payload.packSize).trim())
  ) {
    return { message: "Pack size must contain digits only" };
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

  if (
    isCreate &&
    (!payload.productImages ||
      !Array.isArray(payload.productImages) ||
      !payload.productImages.length)
  ) {
    return { message: "At least one product image is required" };
  }

  if (payload.gst !== undefined && ![5, 12, 18, 28].includes(Number(payload.gst))) {
    return { message: "GST must be one of 5, 12, 18, or 28" };
  }

  return null;
};

/* ================= CREATE ================= */
router.post("/", async (req: Request, res: Response) => {
  try {
    const payload = normalizeB2BPayload(req.body as Record<string, unknown>);
    payload.sku = String(payload.sku || `B2B-${Date.now().toString().slice(-6)}`);

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
    res.status(500).json({ message: err.message });
  }
});

/* ================= LIST ================= */
router.get("/", async (_req, res) => {
  const products = await B2BProduct.find().sort({ createdAt: -1 });
  res.json(products);
});

/* ================= UPDATE ================= */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { _id, createdAt, updatedAt, ...updateData } = req.body;
    const payload = normalizeB2BPayload(updateData as Record<string, unknown>);
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
});

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  await B2BProduct.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

export default router;
