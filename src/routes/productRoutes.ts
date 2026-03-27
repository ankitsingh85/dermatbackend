import express, { Request, Response } from "express";
import upload from "../middleware/uploads";
import Product from "../models/Products";

const router = express.Router();

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
