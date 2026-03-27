import express, { Request, Response } from "express";
import B2BCategory from "../models/B2BCategory";
import upload from "../middleware/uploads";

const router = express.Router();

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim() || (!uploadedImageUrl && !legacyImageUrl)) {
      return res.status(400).json({ message: "Name and image are required" });
    }

    const category = await B2BCategory.create({
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });
    res.status(201).json(category);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await B2BCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    const updateData: Record<string, string> = {};
    if (name?.trim()) updateData.name = String(name).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await B2BCategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await B2BCategory.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
