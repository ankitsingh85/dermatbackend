import express, { Request, Response } from "express";
import B2BProduct from "../models/B2BProduct";

const router = express.Router();

/* ================= CREATE ================= */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      sku,
      productName,
      category,
      subCategory,
      hsnCode,
      brandName,

      packSize,
      pricePerUnit,
      bulkPriceTier,
      moq,
      stockAvailable,
      expiryDate,

      description,
      ingredients,
      usageInstructions,
      treatmentIndications,
      certifications,

      manufacturerName,
      licenseNumber,
      mrp,
      discountedPrice,
      gst,
      taxIncluded,

      productImages,
      msds,
      customerReviews,
      relatedProducts,
      promotionalTags,
    } = req.body;

    const product = new B2BProduct({
      sku,
      productName,
      category,
      subCategory,
      hsnCode,
      brandName,

      packSize,
      pricePerUnit,
      bulkPriceTier,
      moq,
      stockAvailable,
      expiryDate,

      description,
      ingredients,
      usageInstructions,
      treatmentIndications,
      certifications,

      manufacturerName,
      licenseNumber,
      mrp,
      discountedPrice,
      gst,
      taxIncluded,

      productImages,
      msds,
      customerReviews,
      relatedProducts,
      promotionalTags,
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

    const updated = await B2BProduct.findByIdAndUpdate(
      req.params.id,
      updateData,
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
