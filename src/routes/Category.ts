import express from "express";
import Category from "../models/Category";
import upload from "../middleware/uploads";

const router = express.Router();

const getUploadedPath = (file: Express.Multer.File | undefined) => {
  if (!file) return undefined;
  return `/uploads/${file.filename}`;
};

/* ================= GET ALL ================= */
router.get("/", async (_req, res) => {
  try {
    const categories = await Category.find({})
      .select("id name imageUrl")
      .lean();

    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= CREATE ================= */
router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name, imageUrl } = req.body;
    const uploadedImageUrl = getUploadedPath(req.file);
    if (!name) {
      return res.status(400).json({ message: "name required" });
    }
    if (!uploadedImageUrl && !(typeof imageUrl === "string" && imageUrl.trim())) {
      return res.status(400).json({ message: "imageUrl required" });
    }

    const last = await Category.findOne({}).sort({ createdAt: -1 }).lean();
    let newId = "cat-1";
    if (last?.id) {
      const num = parseInt(last.id.split("-")[1], 10);
      newId = `cat-${num + 1}`;
    }

    const category = new Category({
      id: newId,
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || String(imageUrl || "").trim(),
    });

    await category.save();
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= UPDATE ================= */
router.put("/:mongoId", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name, imageUrl } = req.body;
    const uploadedImageUrl = getUploadedPath(req.file);

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (uploadedImageUrl) {
      updateData.imageUrl = uploadedImageUrl;
    } else if (typeof imageUrl === "string" && imageUrl.trim()) {
      updateData.imageUrl = imageUrl.trim();
    }

    const updated = await Category.findByIdAndUpdate(
      req.params.mongoId,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= DELETE ================= */
router.delete("/:mongoId", async (req, res) => {
  try {
    const deleted = await Category.findByIdAndDelete(req.params.mongoId);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ message: "Category deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
