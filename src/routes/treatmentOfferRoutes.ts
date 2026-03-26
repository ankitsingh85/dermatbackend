import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Offer2 from "../models/treatmentOffer";
import ServiceCategory from "../models/serviceCategory";
import TreatmentPlan from "../models/treatmentplans";

const router = express.Router();

// GET ALL OFFERS
router.get("/", async (req: Request, res: Response) => {
  try {
    const offers = await Offer2.find()
      .populate("categoryId")
      .populate("treatmentId")
      .sort({ createdAt: -1 });
    res.status(200).json(offers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offers", error: err });
  }
});

// ADD NEW OFFER (Base64)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { imageBase64, categoryId, treatmentId } = req.body;
    if (!categoryId) return res.status(400).json({ message: "Category is required" });
    if (!treatmentId) return res.status(400).json({ message: "Treatment plan is required" });
    if (!imageBase64) return res.status(400).json({ message: "Image is required" });

    if (!mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ message: "Invalid category id format" });
    }
    if (!mongoose.isValidObjectId(treatmentId)) {
      return res.status(400).json({ message: "Invalid treatment id format" });
    }

    const category = await ServiceCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Service category not found" });
    }

    const treatment = await TreatmentPlan.findById(treatmentId);
    if (!treatment) {
      return res.status(404).json({ message: "Treatment plan not found" });
    }

    const treatmentCategory = (treatment.serviceCategory || "").trim().toLowerCase();
    const selectedCategory = category.name.trim().toLowerCase();
    if (treatmentCategory && treatmentCategory !== selectedCategory) {
      return res.status(400).json({
        message: "Selected treatment plan does not belong to the chosen category",
      });
    }

    const newOffer = new Offer2({
      imageBase64,
      categoryId: category._id,
      treatmentId: treatment._id,
    });
    await newOffer.save();
    const populated = await Offer2.findById(newOffer._id)
      .populate("categoryId")
      .populate("treatmentId");
    res.status(201).json(populated || newOffer);
  } catch (err) {
    res.status(500).json({ message: "Failed to add offer", error: err });
  }
});

// UPDATE OFFER
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { imageBase64, categoryId, treatmentId } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Image is required" });

    const existing = await Offer2.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Offer not found" });

    const resolvedCategoryId =
      categoryId !== undefined ? categoryId : existing.categoryId;
    const resolvedTreatmentId =
      treatmentId !== undefined ? treatmentId : existing.treatmentId;

    const updatePayload: Record<string, unknown> = { imageBase64 };

    if (categoryId !== undefined) {
      if (!mongoose.isValidObjectId(categoryId)) {
        return res.status(400).json({ message: "Invalid category id format" });
      }
      const category = await ServiceCategory.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Service category not found" });
      }
      updatePayload.categoryId = category._id;
    }

    if (treatmentId !== undefined) {
      if (!mongoose.isValidObjectId(treatmentId)) {
        return res.status(400).json({ message: "Invalid treatment id format" });
      }
      const treatment = await TreatmentPlan.findById(treatmentId);
      if (!treatment) {
        return res.status(404).json({ message: "Treatment plan not found" });
      }
      updatePayload.treatmentId = treatment._id;
    }

    if (resolvedCategoryId && resolvedTreatmentId) {
      const category = await ServiceCategory.findById(resolvedCategoryId);
      const treatment = await TreatmentPlan.findById(resolvedTreatmentId);
      const treatmentCategory = (treatment?.serviceCategory || "").trim().toLowerCase();
      const selectedCategory = (category?.name || "").trim().toLowerCase();
      if (treatmentCategory && selectedCategory && treatmentCategory !== selectedCategory) {
        return res.status(400).json({
          message: "Selected treatment plan does not belong to the chosen category",
        });
      }
    }

    const updated = await Offer2.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
    })
      .populate("categoryId")
      .populate("treatmentId");

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update offer", error: err });
  }
});

// DELETE OFFER
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await Offer2.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });
    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
