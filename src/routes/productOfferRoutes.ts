import express, { Request, Response } from "express";
import Offer1 from "../models/productOffer";
import Product from "../models/Products";
import Category from "../models/Category";

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

// ADD NEW OFFER (Base64)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { imageBase64, productId, categoryId } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Image is required" });
    if (!productId) {
      return res.status(400).json({ message: "Product is required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let resolvedCategoryId = "";
    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (category) {
        resolvedCategoryId = category._id.toString();
      } else {
        return res.status(404).json({ message: "Category not found" });
      }
    } else {
      const category = await Category.findOne({ name: product.category });
      resolvedCategoryId = category?._id.toString() || product.category || "";
    }

    const newOffer = new Offer1({
      imageBase64,
      productId: product._id,
      categoryId: resolvedCategoryId,
    });
    await newOffer.save();
    res.status(201).json(newOffer);
  } catch (err) {
    res.status(500).json({ message: "Failed to add offer", error: err });
  }
});

// UPDATE OFFER
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { imageBase64, productId, categoryId } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Image is required" });

    const updatePayload: any = { imageBase64 };

    if (productId) {
      const product = await Product.findById(productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      updatePayload.productId = product._id;
      if (categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) return res.status(404).json({ message: "Category not found" });
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

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update offer", error: err });
  }
});

// DELETE OFFER
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await Offer1.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });
    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
