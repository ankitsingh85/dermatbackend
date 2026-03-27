import express, { Request, Response } from "express";
import ServiceCategory from "../models/serviceCategory";
import upload from "../middleware/uploads";

const router = express.Router();

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "imageUrl is required" });
    }

    const category = new ServiceCategory({
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: "Failed to create service category", error: err });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await ServiceCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch service categories", error: err });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    const category = await ServiceCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Service category not found" });

    if (name?.trim()) category.name = String(name).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      category.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await category.save();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update service category", error: err });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const category = await ServiceCategory.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Service category not found" });

    res.json({ message: "Service category deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete service category", error: err });
  }
});

export default router;
