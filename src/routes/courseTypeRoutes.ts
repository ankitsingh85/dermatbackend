import express from "express";
import CourseType from "../models/courseType";
import upload from "../middleware/uploads";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const courseTypes = await CourseType.find({})
      .select("id name imageUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(courseTypes);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch course types" });
  }
});

router.post("/", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim() || (!uploadedImageUrl && !legacyImageUrl)) {
      return res.status(400).json({ message: "name and imageUrl required" });
    }

    const existing = await CourseType.findOne({
      name: { $regex: new RegExp(`^${String(name).trim()}$`, "i") },
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "Course type already exists" });
    }

    const last = await CourseType.findOne({}).sort({ createdAt: -1 }).lean();
    let newId = "ctype-1";
    if (last?.id) {
      const num = parseInt(last.id.split("-")[1], 10);
      newId = `ctype-${Number.isNaN(num) ? 1 : num + 1}`;
    }

    const courseType = new CourseType({
      id: newId,
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await courseType.save();
    res.status(201).json(courseType);
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to create course type" });
  }
});

router.put("/:mongoId", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Course type name is required" });
    }

    const duplicate = await CourseType.findOne({
      _id: { $ne: req.params.mongoId },
      name: { $regex: new RegExp(`^${String(name).trim()}$`, "i") },
    }).lean();

    if (duplicate) {
      return res.status(409).json({ message: "Course type already exists" });
    }

    const updateData: Record<string, string> = {
      name: String(name).trim(),
    };

    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await CourseType.findByIdAndUpdate(
      req.params.mongoId,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Course type not found" });
    }

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to update course type" });
  }
});

router.delete("/:mongoId", async (req, res) => {
  try {
    const deleted = await CourseType.findByIdAndDelete(req.params.mongoId);
    if (!deleted) {
      return res.status(404).json({ message: "Course type not found" });
    }

    res.json({ message: "Course type deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to delete course type" });
  }
});

export default router;
