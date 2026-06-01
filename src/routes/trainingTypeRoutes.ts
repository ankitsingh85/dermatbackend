import express from "express";
import upload from "../middleware/uploads";
import TrainingType from "../models/trainingType";

const router = express.Router();

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getNextTrainingTypeId = async () => {
  const trainingTypes = await TrainingType.find({})
    .select("id")
    .lean();

  const maxId = trainingTypes.reduce((max, item) => {
    const match = item.id?.match(/^ttype-(\d+)$/);
    if (!match) return max;

    const num = Number.parseInt(match[1], 10);
    return Number.isNaN(num) ? max : Math.max(max, num);
  }, 0);

  return `ttype-${maxId + 1}`;
};

router.get("/", async (_req, res) => {
  try {
    const trainingTypes = await TrainingType.find({})
      .select("id name imageUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json(trainingTypes);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err.message || "Failed to fetch training types" });
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

    const existing = await TrainingType.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i") },
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "Training type already exists" });
    }

    const newId = await getNextTrainingTypeId();

    const trainingType = new TrainingType({
      id: newId,
      name: String(name).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await trainingType.save();
    res.status(201).json(trainingType);
  } catch (err: any) {
    res
      .status(400)
      .json({ message: err.message || "Failed to create training type" });
  }
});

router.put("/:mongoId", upload.single("imageUrl"), async (req, res) => {
  try {
    const { name } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Training type name is required" });
    }

    const duplicate = await TrainingType.findOne({
      _id: { $ne: req.params.mongoId },
      name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, "i") },
    }).lean();

    if (duplicate) {
      return res.status(409).json({ message: "Training type already exists" });
    }

    const updateData: Record<string, string> = {
      name: String(name).trim(),
    };

    if (uploadedImageUrl || legacyImageUrl) {
      updateData.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await TrainingType.findByIdAndUpdate(
      req.params.mongoId,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Training type not found" });
    }

    res.json(updated);
  } catch (err: any) {
    res
      .status(400)
      .json({ message: err.message || "Failed to update training type" });
  }
});

router.delete("/:mongoId", async (req, res) => {
  try {
    const deleted = await TrainingType.findByIdAndDelete(req.params.mongoId);
    if (!deleted) {
      return res.status(404).json({ message: "Training type not found" });
    }

    res.json({ message: "Training type deleted" });
  } catch (err: any) {
    res
      .status(500)
      .json({ message: err.message || "Failed to delete training type" });
  }
});

export default router;
