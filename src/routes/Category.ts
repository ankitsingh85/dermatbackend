import express from "express";
import Category from "../models/Category";

const router = express.Router();

/* ================= GET ALL ================= */
router.get("/", async (_req, res) => {
  try {
    const categories = await Category.find({})
      .select("id name imageUrl exploreImage")
      .lean();

    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/* ================= CREATE ================= */
router.post("/", async (req, res) => {
  try {
    const { name, imageUrl, exploreImage } = req.body;
    if (!name || !imageUrl) {
      return res.status(400).json({ message: "name and imageUrl required" });
    }

    const last = await Category.findOne({}).sort({ createdAt: -1 }).lean();
    let newId = "cat-1";
    if (last?.id) {
      const num = parseInt(last.id.split("-")[1], 10);
      newId = `cat-${num + 1}`;
    }

    const category = new Category({
      id: newId,
      name,
      imageUrl,
      exploreImage: exploreImage || null,
    });

    await category.save();
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

/* ================= UPDATE ================= */
router.put("/:mongoId", async (req, res) => {
  try {
    const { name, imageUrl, exploreImage } = req.body;

    const updated = await Category.findByIdAndUpdate(
      req.params.mongoId,
      { name, imageUrl, exploreImage },
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