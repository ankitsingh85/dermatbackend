// src/routes/admindoctorRoutes.ts
import express, { Request, Response } from "express";
import Doctor from "../models/admindoctor";
import upload from "../middleware/uploads";

const router = express.Router();

const normalizePhone = (value: unknown) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .trim();

const normalizeText = (value: unknown) => String(value ?? "").trim();

const getUploadedPath = (file: Express.Multer.File | undefined) => {
  if (!file) return undefined;
  return `/uploads/${file.filename}`;
};

// CREATE doctor
router.post("/", upload.single("profileImage"), async (req: Request<{}, {}, any>, res: Response) => {
  try {
    const { title, firstName, lastName, specialist, email, phone, description, address } = req.body;
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = normalizeText(email).toLowerCase();

    if (!firstName || !lastName || !specialist || !cleanEmail || !cleanPhone)
      return res.status(400).json({ msg: "Please provide all required fields." });

    const emailExists = await Doctor.findOne({ email: cleanEmail });
    if (emailExists) return res.status(400).json({ msg: "Email already exists for another doctor" });

    const phoneExists = await Doctor.findOne({ phone: cleanPhone });
    if (phoneExists) return res.status(400).json({ msg: "Mobile number already exists for another doctor" });

    const doctor = new Doctor({
      title,
      firstName,
      lastName,
      specialist,
      email: cleanEmail,
      phone: cleanPhone,
      description: normalizeText(description) || undefined,
      address: normalizeText(address) || undefined,
      profileImage: getUploadedPath(req.file),
      createdByAdmin: true,
    });

    const saved = await doctor.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// GET doctors – FIXED: include old doctors
router.get("/", async (_req: Request, res: Response) => {
  try {
    const doctors = await Doctor.find({
      $or: [
        { createdByAdmin: true },
        { createdByAdmin: { $exists: false } } // include old docs
      ]
    })
      .sort({ createdAt: -1 });

    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// UPDATE doctor
router.put(
  "/:id",
  upload.single("profileImage"),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const updateData: any = { ...req.body };

      if (typeof updateData.phone === "string") {
        updateData.phone = normalizePhone(updateData.phone);
      }
      if (typeof updateData.email === "string") {
        updateData.email = normalizeText(updateData.email).toLowerCase();
      }

      const uploadedProfileImage = getUploadedPath(req.file);
      if (uploadedProfileImage) {
        updateData.profileImage = uploadedProfileImage;
      }

      if (updateData.email) {
        const emailExists = await Doctor.findOne({
          email: updateData.email,
          _id: { $ne: req.params.id },
        });
        if (emailExists) {
          return res.status(400).json({ msg: "Email already exists for another doctor" });
        }
      }

      if (updateData.phone) {
        const phoneExists = await Doctor.findOne({
          phone: updateData.phone,
          _id: { $ne: req.params.id },
        });
        if (phoneExists) {
          return res.status(400).json({ msg: "Mobile number already exists for another doctor" });
        }
      }

      const updated = await Doctor.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updated) return res.status(404).json({ msg: "Doctor not found" });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Server error" });
    }
  }
);

// DELETE doctor
router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const deleted = await Doctor.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ msg: "Doctor not found" });
    res.json({ msg: "Doctor deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
