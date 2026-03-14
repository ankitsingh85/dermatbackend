import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import ClinicLogin from "../models/cliniclogin";

const router = Router();

const generateToken = (id: string, role: string) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1h" }
  );
};

router.post("/mobile-login", async (req: Request, res: Response) => {
  try {
    const { contactNo, clinicName, email, address, ownerName, whatsapp } = req.body as {
      contactNo?: string;
      clinicName?: string;
      email?: string;
      address?: string;
      ownerName?: string;
      whatsapp?: string;
    };

    const normalizedContact = (contactNo || "").replace(/\D/g, "");
    if (normalizedContact.length !== 10) {
      return res.status(400).json({ message: "Enter a valid 10 digit mobile number" });
    }

    let clinic = await ClinicLogin.findOne({ contactNo: normalizedContact });

    if (clinic) {
      const nextClinicName = (clinicName || "").trim();
      const nextEmail = (email || "").trim().toLowerCase();
      const nextAddress = (address || "").trim();
      const nextOwnerName = (ownerName || "").trim();
      const nextWhatsapp = (whatsapp || "").replace(/\D/g, "");

      const requiredMissing = !clinic.clinicName || !clinic.email || !clinic.address;
      if (requiredMissing && (!nextClinicName || !nextEmail || !nextAddress)) {
        return res.status(400).json({ message: "Clinic details are required" });
      }

      if (nextEmail && nextEmail !== clinic.email) {
        const emailTaken = await ClinicLogin.findOne({
          email: nextEmail,
          _id: { $ne: clinic._id },
        });
        if (emailTaken) {
          return res.status(400).json({ message: "Email already registered with another clinic" });
        }
      }

      let shouldUpdate = false;
      if (nextClinicName && nextClinicName !== clinic.clinicName) {
        clinic.clinicName = nextClinicName;
        shouldUpdate = true;
      }
      if (nextEmail && nextEmail !== clinic.email) {
        clinic.email = nextEmail;
        shouldUpdate = true;
      }
      if (nextAddress && nextAddress !== clinic.address) {
        clinic.address = nextAddress;
        shouldUpdate = true;
      }
      if (nextOwnerName && nextOwnerName !== clinic.ownerName) {
        clinic.ownerName = nextOwnerName;
        shouldUpdate = true;
      }
      if (nextWhatsapp && nextWhatsapp !== clinic.whatsapp) {
        clinic.whatsapp = nextWhatsapp;
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        await clinic.save();
      }
    } else {
      const nextClinicName = (clinicName || "").trim();
      const nextEmail = (email || "").trim().toLowerCase();
      const nextAddress = (address || "").trim();
      const nextOwnerName = (ownerName || "").trim();
      const nextWhatsapp = (whatsapp || "").replace(/\D/g, "");

      if (!nextClinicName || !nextEmail || !nextAddress) {
        return res.status(400).json({ message: "Clinic details are required" });
      }

      const emailTaken = await ClinicLogin.findOne({ email: nextEmail });
      if (emailTaken) {
        return res.status(400).json({ message: "Email already registered" });
      }

      clinic = await ClinicLogin.create({
        clinicName: nextClinicName,
        email: nextEmail,
        contactNo: normalizedContact,
        address: nextAddress,
        ownerName: nextOwnerName || undefined,
        whatsapp: nextWhatsapp || undefined,
      });
    }

    const token = generateToken(clinic._id.toString(), "clinic");

    return res.json({
      message: "Clinic login successful",
      token,
      role: "clinic",
      clinic: {
        id: clinic._id,
        clinicName: clinic.clinicName,
        email: clinic.email,
        contactNo: clinic.contactNo,
        address: clinic.address,
        ownerName: clinic.ownerName,
        whatsapp: clinic.whatsapp,
      },
    });
  } catch (err: any) {
    console.error("Clinic mobile login error:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
});

export default router;
