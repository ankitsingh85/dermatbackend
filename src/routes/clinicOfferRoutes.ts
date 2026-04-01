import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Offer3 from "../models/clinicOffer";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import upload from "../middleware/uploads";

const router = express.Router();

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

// ADD NEW OFFER (Upload)
router.post(
  "/",
  upload.array("images", 20),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      const { clinicId, categoryId } = req.body;

      if (!files.length) return res.status(400).json({ message: "Image is required" });
      if (!clinicId) {
        await deleteUploadedFiles(files);
        return res.status(400).json({ message: "Clinic is required" });
      }

      const clinic = await Clinic.findById(clinicId);
      if (!clinic) {
        await deleteUploadedFiles(files);
        return res.status(404).json({ message: "Clinic not found" });
      }

      let resolvedCategoryId = "";
      if (categoryId) {
        const category = await ClinicCategory.findById(categoryId);
        if (!category) {
          await deleteUploadedFiles(files);
          return res.status(404).json({ message: "Category not found" });
        }

        if (clinic.dermaCategory.toString() !== category._id.toString()) {
          await deleteUploadedFiles(files);
          return res.status(400).json({
            message: "Selected clinic does not belong to the chosen category",
          });
        }

        resolvedCategoryId = category._id.toString();
      } else {
        resolvedCategoryId = clinic.dermaCategory.toString();
      }

      const created = await Offer3.insertMany(
        files.map((file) => ({
          imageBase64: getUploadedPath(file),
          clinicId: clinic._id,
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
      const existing = await Offer3.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Offer not found" });

      const file = req.file;
      const { clinicId, categoryId } = req.body;
      if (!file) return res.status(400).json({ message: "Image is required" });

      const updatePayload: Record<string, unknown> = { imageBase64: getUploadedPath(file) };

      if (clinicId) {
        const clinic = await Clinic.findById(clinicId);
        if (!clinic) {
          await deleteStoredFile(updatePayload.imageBase64 as string);
          return res.status(404).json({ message: "Clinic not found" });
        }
        updatePayload.clinicId = clinic._id;

        if (categoryId) {
          const category = await ClinicCategory.findById(categoryId);
          if (!category) {
            await deleteStoredFile(updatePayload.imageBase64 as string);
            return res.status(404).json({ message: "Category not found" });
          }

          if (clinic.dermaCategory.toString() !== category._id.toString()) {
            await deleteStoredFile(updatePayload.imageBase64 as string);
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
      if (!updated) {
        await deleteStoredFile(updatePayload.imageBase64 as string);
        return res.status(404).json({ message: "Offer not found" });
      }

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
    const existing = await Offer3.findById(req.params.id);
    const deleted = await Offer3.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });

    await deleteStoredFile(existing?.imageBase64);

    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
