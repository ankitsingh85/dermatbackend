import express, { Request, Response } from "express";
import Offer3 from "../models/clinicOffer";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";

const router = express.Router();

// GET ALL OFFERS
router.get("/", async (req: Request, res: Response) => {
  try {
    const offers = await Offer3.find()
      .populate("clinicId")
      .populate("categoryId")
      .sort({ createdAt: -1 });
    res.status(200).json(offers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offers", error: err });
  }
});

// ADD NEW OFFER (Base64)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { imageBase64, clinicId, categoryId } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Image is required" });
    if (!clinicId) return res.status(400).json({ message: "Clinic is required" });

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) return res.status(404).json({ message: "Clinic not found" });

    let resolvedCategoryId = "";
    if (categoryId) {
      const category = await ClinicCategory.findById(categoryId);
      if (!category) return res.status(404).json({ message: "Category not found" });

      if (clinic.dermaCategory.toString() !== category._id.toString()) {
        return res.status(400).json({
          message: "Selected clinic does not belong to the chosen category",
        });
      }

      resolvedCategoryId = category._id.toString();
    } else {
      resolvedCategoryId = clinic.dermaCategory.toString();
    }

    const newOffer = new Offer3({
      imageBase64,
      clinicId: clinic._id,
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
    const { imageBase64, clinicId, categoryId } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Image is required" });

    const updatePayload: Record<string, unknown> = { imageBase64 };

    if (clinicId) {
      const clinic = await Clinic.findById(clinicId);
      if (!clinic) return res.status(404).json({ message: "Clinic not found" });
      updatePayload.clinicId = clinic._id;

      if (categoryId) {
        const category = await ClinicCategory.findById(categoryId);
        if (!category) return res.status(404).json({ message: "Category not found" });

        if (clinic.dermaCategory.toString() !== category._id.toString()) {
          return res.status(400).json({
            message: "Selected clinic does not belong to the chosen category",
          });
        }

        updatePayload.categoryId = category._id;
      } else {
        updatePayload.categoryId = clinic.dermaCategory;
      }
    }

    const updated = await Offer3.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
    });
    if (!updated) return res.status(404).json({ message: "Offer not found" });

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update offer", error: err });
  }
});

// DELETE OFFER
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await Offer3.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });
    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
