// src/routes/admindoctorRoutes.ts
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import Doctor from "../models/admindoctor";

const router = express.Router();

const normalizePhone = (value: unknown) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .trim();

// CREATE doctor (unchanged)
router.post("/", async (req: Request<{}, {}, any>, res: Response) => {
  try {
    const { title, firstName, lastName, specialist, email, phone, password } = req.body;
    const cleanPhone = normalizePhone(phone);

    if (!firstName || !lastName || !specialist || !email || !cleanPhone || !password)
      return res.status(400).json({ msg: "Please provide all required fields." });

    const existing = await Doctor.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ msg: "Email already registered." });

    const hashed = await bcrypt.hash(password, 10);
    const doctor = new Doctor({
      title,
      firstName,
      lastName,
      specialist,
      email: email.toLowerCase(),
      phone: cleanPhone,
      password: hashed,
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
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// UPDATE doctor
router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const updateData: any = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }

    if (typeof updateData.phone === "string") {
      updateData.phone = normalizePhone(updateData.phone);
    }

    const updated = await Doctor.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return res.status(404).json({ msg: "Doctor not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

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
