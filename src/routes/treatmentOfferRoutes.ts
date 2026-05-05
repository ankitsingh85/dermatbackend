import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Offer2 from "../models/treatmentOffer";
import ServiceCategory from "../models/serviceCategory";
import TreatmentPlan from "../models/treatmentplans";
import upload from "../middleware/uploads";

const router = express.Router();

const getUploadedPath = (file?: Express.Multer.File) =>
  file ? `/uploads/${file.filename}` : "";

const normalizeOfferPayload = (offer: any) => {
  const source = typeof offer?.toObject === "function" ? offer.toObject() : offer;
  if (!source) return source;

  const imageUrl = source.imageUrl || source.imageBase64 || "";
  const { imageBase64: _legacyImageBase64, ...rest } = source;
  return {
    ...rest,
    imageUrl,
  };
};

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

// GET ALL OFFERS
router.get("/", async (_req: Request, res: Response) => {
  try {
    const offers = await Offer2.find()
      .select("+imageBase64")
      .populate("categoryId")
      .populate("treatmentId")
      .sort({ createdAt: -1 });
    res.status(200).json(offers.map(normalizeOfferPayload));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offers", error: err });
  }
});

// ADD NEW OFFER (Upload)
router.post(
  "/",
  upload.array("images", 20),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      const { categoryId, treatmentId } = req.body;

      if (!files.length) return res.status(400).json({ message: "Image is required" });
      if (!categoryId) {
        await deleteUploadedFiles(files);
        return res.status(400).json({ message: "Category is required" });
      }
      if (!treatmentId) {
        await deleteUploadedFiles(files);
        return res.status(400).json({ message: "Treatment plan is required" });
      }

      if (!mongoose.isValidObjectId(categoryId)) {
        await deleteUploadedFiles(files);
        return res.status(400).json({ message: "Invalid category id format" });
      }
      if (!mongoose.isValidObjectId(treatmentId)) {
        await deleteUploadedFiles(files);
        return res.status(400).json({ message: "Invalid treatment id format" });
      }

      const category = await ServiceCategory.findById(categoryId);
      if (!category) {
        await deleteUploadedFiles(files);
        return res.status(404).json({ message: "Service category not found" });
      }

      const treatment = await TreatmentPlan.findById(treatmentId);
      if (!treatment) {
        await deleteUploadedFiles(files);
        return res.status(404).json({ message: "Treatment plan not found" });
      }

      const treatmentCategory = (treatment.serviceCategory || "").trim().toLowerCase();
      const selectedCategory = category.name.trim().toLowerCase();
      if (treatmentCategory && treatmentCategory !== selectedCategory) {
        await deleteUploadedFiles(files);
        return res.status(400).json({
          message: "Selected treatment plan does not belong to the chosen category",
        });
      }

      const created = await Offer2.insertMany(
        files.map((file) => ({
          imageUrl: getUploadedPath(file),
          categoryId: category._id,
          treatmentId: treatment._id,
        }))
      );

      const populated = await Offer2.find({
        _id: { $in: created.map((item) => item._id) },
      })
        .populate("categoryId")
        .populate("treatmentId")
        .sort({ createdAt: -1 });

      const responsePayload = populated.length > 0 ? populated : created;
      res.status(201).json(responsePayload.map(normalizeOfferPayload));
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
      const existing = await Offer2.findById(req.params.id).select("+imageBase64");
      if (!existing) return res.status(404).json({ message: "Offer not found" });

      const file = req.file;
      if (!file) return res.status(400).json({ message: "Image is required" });

      const { categoryId, treatmentId } = req.body;
      const updatePayload: any = {
        $set: {
          imageUrl: getUploadedPath(file),
        },
        $unset: {
          imageBase64: "",
        },
      };

      const resolvedCategoryId =
        categoryId !== undefined ? categoryId : existing.categoryId;
      const resolvedTreatmentId =
        treatmentId !== undefined ? treatmentId : existing.treatmentId;

      if (categoryId !== undefined) {
        if (!mongoose.isValidObjectId(categoryId)) {
          await deleteStoredFile(updatePayload.$set.imageUrl);
          return res.status(400).json({ message: "Invalid category id format" });
        }
        const category = await ServiceCategory.findById(categoryId);
        if (!category) {
          await deleteStoredFile(updatePayload.$set.imageUrl);
          return res.status(404).json({ message: "Service category not found" });
        }
        updatePayload.$set.categoryId = category._id;
      }

      if (treatmentId !== undefined) {
        if (!mongoose.isValidObjectId(treatmentId)) {
          await deleteStoredFile(updatePayload.$set.imageUrl);
          return res.status(400).json({ message: "Invalid treatment id format" });
        }
        const treatment = await TreatmentPlan.findById(treatmentId);
        if (!treatment) {
          await deleteStoredFile(updatePayload.$set.imageUrl);
          return res.status(404).json({ message: "Treatment plan not found" });
        }
        updatePayload.$set.treatmentId = treatment._id;
      }

      if (resolvedCategoryId && resolvedTreatmentId) {
        const category = await ServiceCategory.findById(resolvedCategoryId);
        const treatment = await TreatmentPlan.findById(resolvedTreatmentId);
        const treatmentCategory = (treatment?.serviceCategory || "").trim().toLowerCase();
        const selectedCategory = (category?.name || "").trim().toLowerCase();
        if (treatmentCategory && selectedCategory && treatmentCategory !== selectedCategory) {
          await deleteStoredFile(updatePayload.$set.imageUrl);
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

      if (!updated) {
        await deleteStoredFile(updatePayload.$set.imageUrl);
        return res.status(404).json({ message: "Offer not found" });
      }

      await deleteStoredFile(existing.imageUrl || existing.imageBase64);

      res.status(200).json(normalizeOfferPayload(updated));
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
    const existing = await Offer2.findById(req.params.id).select("+imageBase64");
    const deleted = await Offer2.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });

    await deleteStoredFile(existing?.imageUrl || existing?.imageBase64);

    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
