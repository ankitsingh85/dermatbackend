import express from "express";
import bcrypt from "bcryptjs";
import Admin from "../models/admin";
import { createAdmin } from "../controllers/adminController";

const router = express.Router();

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ================= CREATE ADMIN ================= */

router.post("/", createAdmin);

/* ================= LIST ADMINS ================= */

router.get("/", async (_req, res) => {
  try {
    const admins = await Admin.find().select("-password");

    res.status(200).json(admins);
  } catch {
    res.status(500).json({
      message: "Error fetching admins",
    });
  }
});

/* ================= FORGOT PASSWORD BY EMAIL ================= */

router.post("/forgot-password", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be 8 characters with letter, number and symbol",
      });
    }

    const admin = await Admin.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!admin) {
      return res.status(404).json({
        message: "Admin email not found",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    admin.password = hashedPassword;

    await admin.save();

    res.json({
      message: "Password updated successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Password reset failed",
    });
  }
});

/* ================= UPDATE ADMIN ================= */

router.put("/:id", async (req, res) => {
  const { name, email, phone, role } = req.body;

  try {
    const updateData: Record<string, unknown> = {};

    if (name) {
      const cleanName = name.trim();

      if (!nameRegex.test(cleanName)) {
        return res.status(400).json({
          message: "Name should contain letters only",
        });
      }

      updateData.name = cleanName;
    }

    if (email) {
      updateData.email = email.trim().toLowerCase();
    }

    if (phone) {
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          message: "Phone must contain 10 digits",
        });
      }

      updateData.phone = phone;
    }

    if (role) {
      updateData.role = role;
    }

    const updatedAdmin = await Admin.findByIdAndUpdate(
      req.params.id,

      updateData,

      {
        new: true,
        runValidators: true,
      },
    ).select("-password");

    if (!updatedAdmin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    res.json({
      message: "Admin updated successfully",

      admin: updatedAdmin,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error while updating admin",
    });
  }
});

/* ================= DELETE ADMIN ================= */

router.delete("/:id", async (req, res) => {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    res.json({
      message: "Admin deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error while deleting admin",
    });
  }
});

export default router;
