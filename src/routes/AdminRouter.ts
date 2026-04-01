import express from "express";
import Admin from "../models/admin";
import { createAdmin } from "../controllers/adminController";

const router = express.Router();

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;

/* ================= CREATE ADMIN ================= */
router.post("/", createAdmin);

/* ================= LIST ADMINS ================= */
router.get("/", async (_req, res) => {
  try {
    const admins = await Admin.find().select("-password");
    res.status(200).json(admins);
  } catch (err) {
    res.status(500).json({ message: "Error fetching admins" });
  }
});

/* ================= UPDATE ADMIN ================= */
router.put("/:id", async (req, res) => {
  const { name, email, phone, role } = req.body;

  try {
    const updateData: Record<string, unknown> = {};

    if (typeof name === "string") {
      const cleanName = name.trim();
      if (!cleanName) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (!nameRegex.test(cleanName)) {
        return res
          .status(400)
          .json({ message: "Name should contain only letters and spaces" });
      }
      updateData.name = cleanName;
    }

    if (typeof email === "string") {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        return res.status(400).json({ message: "Email is required" });
      }
      updateData.email = cleanEmail;
    }

    if (typeof phone === "string") {
      const cleanPhone = phone.trim();
      if (!cleanPhone) {
        return res.status(400).json({ message: "Contact No. is required" });
      }
      if (!phoneRegex.test(cleanPhone)) {
        return res
          .status(400)
          .json({ message: "Contact No. must contain exactly 10 digits" });
      }
      updateData.phone = cleanPhone;
    }

    if (typeof role === "string") {
      const cleanRole = role.trim().toLowerCase();
      if (["admin", "superadmin", "manager"].includes(cleanRole)) {
        updateData.role = cleanRole;
      }
    }

    const updatedAdmin = await Admin.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({
      message: "Admin updated successfully",
      admin: updatedAdmin,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error while updating admin" });
  }
});

/* ================= DELETE ADMIN ================= */
router.delete("/:id", async (req, res) => {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({ message: "Admin deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error while deleting admin" });
  }
});

export default router;
