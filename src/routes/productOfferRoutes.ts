import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Offer1 from "../models/productOffer";
import Product from "../models/Products";
import Category from "../models/Category";
import upload from "../middleware/uploads";

const router = express.Router();

// GET ALL OFFERS
router.get("/", async (req: Request, res: Response) => {
  try {
    const offers = await Offer1.find().populate("productId").sort({ createdAt: -1 });
    res.status(200).json(offers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offers", error: err });
  }
});

const getUploadedPath = (file?: Express.Multer.File) =>
  file ? `/uploads/${file.filename}` : "";

const deleteStoredFile = async (storedPath?: string | null) => {
  if (!storedPath || !storedPath.startsWith("/uploads/")) return;

  const absolutePath = path.join(process.cwd(), storedPath.replace(/^\//, ""));
  try {
    await fs.promises.unlink(absolutePath);
  } catch {
    // ignore missing files or cleanup errors
  }
};

const deleteUploadedFiles = async (files: Express.Multer.File[] | undefined) => {
  if (!files || files.length === 0) return;
  await Promise.all(files.map((file) => deleteStoredFile(`/uploads/${file.filename}`)));
};

// ADD NEW OFFER (Upload)
router.post(
  "/",
  upload.array("images", 20),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      const { productId, categoryId } = req.body;

      if (!files.length) {
        return res.status(400).json({ message: "Image is required" });
      }
      if (!productId) {
        await deleteUploadedFiles(files);
        return res.status(400).json({ message: "Product is required" });
      }

      const product = await Product.findById(productId);
      if (!product) {
        await deleteUploadedFiles(files);
        return res.status(404).json({ message: "Product not found" });
      }

      let resolvedCategoryId = "";
      if (categoryId) {
        const category = await Category.findById(categoryId);
        if (category) {
          resolvedCategoryId = category._id.toString();
        } else {
          await deleteUploadedFiles(files);
          return res.status(404).json({ message: "Category not found" });
        }
      } else {
        const category = await Category.findOne({ name: product.category });
        resolvedCategoryId = category?._id.toString() || product.category || "";
      }

      const created = await Offer1.insertMany(
        files.map((file) => ({
          imageBase64: getUploadedPath(file),
          productId: product._id,
          categoryId: resolvedCategoryId,
        }))
      );

      res.status(201).json(created);
    } catch (err) {
      await deleteUploadedFiles((req.files as Express.Multer.File[] | undefined) || []);
      res.status(500).json({ message: "Failed to add offer", error: err });
    }
  }
);

// UPDATE OFFER
router.put(
  "/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const existing = await Offer1.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Offer not found" });

      const file = req.file;
      const { productId, categoryId } = req.body;

      if (!file) {
        return res.status(400).json({ message: "Image is required" });
      }

      const updatePayload: any = { imageBase64: getUploadedPath(file) };

      if (productId) {
        const product = await Product.findById(productId);
        if (!product) {
          await deleteStoredFile(updatePayload.imageBase64);
          return res.status(404).json({ message: "Product not found" });
        }
        updatePayload.productId = product._id;
        if (categoryId) {
          const category = await Category.findById(categoryId);
          if (!category) {
            await deleteStoredFile(updatePayload.imageBase64);
            return res.status(404).json({ message: "Category not found" });
          }
          updatePayload.categoryId = category._id.toString();
        } else {
          const category = await Category.findOne({ name: product.category });
          updatePayload.categoryId = category?._id.toString() || product.category || "";
        }
      }

      const updated = await Offer1.findByIdAndUpdate(
        req.params.id,
        updatePayload,
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: "Offer not found" });

      await deleteStoredFile(existing.imageBase64);

      res.status(200).json(updated);
    } catch (err) {
      if (req.file) {
        await deleteStoredFile(getUploadedPath(req.file));
      }
      res.status(500).json({ message: "Failed to update offer", error: err });
    }
  }
);

// DELETE OFFER
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const existing = await Offer1.findById(req.params.id);
    const deleted = await Offer1.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });

    await deleteStoredFile(existing?.imageBase64);

    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
