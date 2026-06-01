import express from "express";
import ClinicCategory from "../models/clinicCategory";
import upload from "../middleware/uploads";

const router = express.Router();

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getNextClinicCategoryId = async () => {
  const categories = await ClinicCategory.find({})
    .select("categoryId")
    .lean();

  const maxId = categories.reduce((max, category) => {
    const match = category.categoryId?.match(/^ccat-(\d+)$/);
    if (!match) return max;

    const num = Number.parseInt(match[1], 10);
    return Number.isNaN(num) ? max : Math.max(max, num);
  }, 0);

  return `ccat-${maxId + 1}`;
};

router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "Category image is required" });
    }

    const existing = await ClinicCategory.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i") },
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "Clinic category already exists" });
    }

    const categoryId = await getNextClinicCategoryId();

    const category = new ClinicCategory({
      categoryId,
      name: String(name).trim(),
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
    const categories = await ClinicCategory.find()
      .select("categoryId name imageUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const duplicate = await ClinicCategory.findOne({
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i") },
    }).lean();

    if (duplicate) {
      return res.status(409).json({ message: "Clinic category already exists" });
    }

    const updateData: Record<string, string> = {
      name: String(name).trim(),
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
