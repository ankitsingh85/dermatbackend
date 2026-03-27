import express from "express";
import ClinicCategory from "../models/clinicCategory";
import upload from "../middleware/uploads";

const router = express.Router();

router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { categoryId, name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!categoryId || !name) {
      return res
        .status(400)
        .json({ message: "Category ID and Name are required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "Category image is required" });
    }

    const existing = await ClinicCategory.findOne({ categoryId });
    if (existing) {
      return res.status(400).json({ message: "Category ID must be unique" });
    }

    const category = new ClinicCategory({
      categoryId,
      name,
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating clinic category:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const categories = await ClinicCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req, res) => {
  try {
    const { categoryId, name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!categoryId || !name) {
      return res
        .status(400)
        .json({ message: "Category ID and Name are required" });
    }

    const existing = await ClinicCategory.findOne({
      categoryId,
      _id: { $ne: req.params.id },
    });

    if (existing) {
      return res.status(400).json({ message: "Category ID must be unique" });
    }

    const updateData: Record<string, string> = {
      categoryId,
      name,
    };

    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await ClinicCategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating clinic category:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await ClinicCategory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting clinic category:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
