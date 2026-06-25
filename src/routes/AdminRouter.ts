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

/* ================= LIST ADMINS ================= */

router.get("/", async (_req, res) => {
  try {
    const admins = await Admin.find()
      .select(
        "empId name email phone role lastModifiedAt lastModifiedField createdAt updatedAt",
      )
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,

      admins: admins.map((admin) => ({
        _id: admin._id,

        // SAME NAME AS FRONTEND
        empId: admin.empId,

        name: admin.name,

        email: admin.email,

        phone: admin.phone,

        role: admin.role,

        // SAME NAME AS FRONTEND
        lastModifiedField: admin.lastModifiedField || "No modification",

        // SAME NAME AS FRONTEND
        lastModifiedAt: admin.lastModifiedAt || admin.createdAt,

        createdAt: admin.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
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
/* ================= UPDATE ADMIN ================= */

router.put("/:id", async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("+password");

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    const { name, email, phone, role, password } = req.body;

    if (name) {
      admin.name = name.trim();

      admin.lastModifiedField = "Name Changed";
    }

    if (email) {
      admin.email = email.trim().toLowerCase();
    }

    if (phone) {
      admin.phone = phone;
    }

    if (role) {
      admin.role = role;

      admin.lastModifiedField = "Access Level Changed";
    }

    if (password) {
      admin.password = password;

      admin.lastModifiedField = "Password Changed";
    }

    admin.lastModifiedAt = new Date();

    await admin.save();

    res.json({
      message: "Admin updated successfully",

      admin,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Update failed",
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
