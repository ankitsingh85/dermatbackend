import express, { Request, Response } from "express";
import ClinicService from "../models/clinicService";
import upload from "../middleware/uploads";

const router = express.Router();

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!name?.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!description?.trim()) {
      return res.status(400).json({ message: "Description is required" });
    }
    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "imageUrl is required" });
    }

    const service = new ClinicService({
      name: String(name).trim(),
      description: String(description).trim(),
      imageUrl: uploadedImageUrl || legacyImageUrl,
    });

    await service.save();
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: "Failed to create clinic service", error: err });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const services = await ClinicService.find().sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch clinic services", error: err });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    const service = await ClinicService.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Clinic service not found" });

    if (name?.trim()) service.name = String(name).trim();
    if (description?.trim()) service.description = String(description).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      service.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    const updated = await service.save();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update clinic service", error: err });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const service = await ClinicService.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: "Clinic service not found" });

    res.json({ message: "Clinic service deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete clinic service", error: err });
  }
});

export default router;
