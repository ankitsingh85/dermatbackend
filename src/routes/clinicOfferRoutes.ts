import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Offer3 from "../models/clinicOffer";
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
    const offers = await Offer3.find()
      .select("+imageBase64")
      .populate("clinicId")
      .populate("categoryId")
      .sort({ createdAt: -1 });
    res.status(200).json(offers.map(normalizeOfferPayload));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch offers", error: err });
  }
});

// ADD NEW OFFER (Upload) — plain image upload, no clinic/category link
// required (these are now standalone coupon promo banners).
router.post(
  "/",
  upload.array("images", 20),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];

      if (!files.length) return res.status(400).json({ message: "Image is required" });

      const created = await Offer3.insertMany(
        files.map((file) => ({
          imageUrl: getUploadedPath(file),
        }))
      );

      res.status(201).json(created.map(normalizeOfferPayload));
    } catch (err) {
      await deleteUploadedFiles((req.files as Express.Multer.File[] | undefined) || []);
      res.status(500).json({ message: "Failed to add offer", error: err });
    }
  }
);

// UPDATE OFFER — swaps the image only, no clinic/category link involved.
router.put(
  "/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const existing = await Offer3.findById(req.params.id).select("+imageBase64");
      if (!existing) return res.status(404).json({ message: "Offer not found" });

      const file = req.file;
      if (!file) return res.status(400).json({ message: "Image is required" });

      const updatePayload: any = {
        $set: { imageUrl: getUploadedPath(file) },
        $unset: { imageBase64: "" },
      };

      const updated = await Offer3.findByIdAndUpdate(req.params.id, updatePayload, {
        new: true,
      });
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
    const existing = await Offer3.findById(req.params.id).select("+imageBase64");
    const deleted = await Offer3.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Offer not found" });

    await deleteStoredFile(existing?.imageUrl || existing?.imageBase64);

    res.status(200).json({ message: "Offer deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete offer", error: err });
  }
});

export default router;
