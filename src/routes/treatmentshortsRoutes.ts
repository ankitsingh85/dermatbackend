import express from "express";
import TreatmentShort from "../models/treatmentshorts";

const router = express.Router();

const getEmbedUrl = (platform: string, url: string) => {
  if (platform === "youtube") {
    return url.replace("shorts/", "embed/");
  }
  if (platform === "instagram") {
    if (!url.endsWith("/")) url += "/";
    return `https://www.instagram.com/p/${url.split("/").filter(Boolean).pop()}/embed`;
  }
  return url;
};

router.post("/", async (req, res) => {
  try {
    const { platform, videoUrl, title } = req.body;

    if (!platform || !videoUrl) {
      return res.status(400).json({ message: "Platform and videoUrl required" });
    }

    const newShort = new TreatmentShort({
      platform,
      videoUrl,
      title: typeof title === "string" ? title.trim() : "",
    });
    await newShort.save();

    return res.status(201).json({
      ...newShort.toObject(),
      embedUrl: getEmbedUrl(platform, videoUrl),
    });
  } catch (error) {
    console.error("Error creating treatment short:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const shorts = await TreatmentShort.find().sort({ createdAt: -1 });

    const data = shorts.map((short) => ({
      ...short.toObject(),
      embedUrl: getEmbedUrl(short.platform, short.videoUrl),
    }));

    return res.json(data);
  } catch (error) {
    console.error("Error fetching treatment shorts:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { platform, videoUrl, title } = req.body;

    if (!platform || !videoUrl) {
      return res.status(400).json({ message: "Platform and videoUrl required" });
    }

    const updatedShort = await TreatmentShort.findByIdAndUpdate(
      req.params.id,
      {
        platform,
        videoUrl,
        title: typeof title === "string" ? title.trim() : "",
      },
      { new: true, runValidators: true }
    );

    if (!updatedShort) {
      return res.status(404).json({ message: "Short not found" });
    }

    return res.json({
      ...updatedShort.toObject(),
      embedUrl: getEmbedUrl(updatedShort.platform, updatedShort.videoUrl),
    });
  } catch (error) {
    console.error("Error updating treatment short:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const short = await TreatmentShort.findByIdAndDelete(req.params.id);
    if (!short) {
      return res.status(404).json({ message: "Short not found" });
    }
    return res.json({ message: "Treatment short deleted successfully" });
  } catch (error) {
    console.error("Error deleting treatment short:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
