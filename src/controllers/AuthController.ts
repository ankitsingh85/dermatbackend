import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/admin";
import User from "../models/user";

/* ================= JWT HELPER ================= */
const generateToken = (id: string, role: string) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1h" }
  );
};

/* ================= ADMIN SIGNUP ================= */
export const adminSignup = async (req: Request, res: Response) => {
  try {
    const { empId, name, email, phone, password, role } = req.body;

    if (!empId || !email || !password) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const normalizedRole =
      role === "superadmin" || role === "manager" ? role : "admin";

    const newAdmin = await Admin.create({
      empId,
      name,
      email,
      phone, // ✅ FIXED (was number)
      password, // 🔐 hashed by model
      role: normalizedRole,
    });

    const token = generateToken(newAdmin._id.toString(), newAdmin.role);

    res.status(201).json({
      message: "Admin signup successful",
      token,
      role: newAdmin.role,
      admin: {
        id: newAdmin._id,
        empId: newAdmin.empId,
        name: newAdmin.name,
        email: newAdmin.email,
        phone: newAdmin.phone,
        role: newAdmin.role,
      },
    });
  } catch (err: any) {
    console.error("Admin signup error:", err);
    res.status(500).json({
      message: "Admin signup failed",
      error: err.message,
    });
  }
};

/* ================= ADMIN LOGIN ================= */
// adminLogin controller (FINAL)
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email: email.toLowerCase() }).select("+password");
    if (!admin) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = generateToken(admin._id.toString(), admin.role);

    // 🔥 IMPORTANT: token must be in JSON
    return res.status(200).json({
      message: "Login successful",
      token,
      role: admin.role,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Login failed" });
  }
};
/* ================= USER MOBILE LOGIN ================= */
export const userMobileLogin = async (req: Request, res: Response) => {
  try {
    const { contactNo, name, email } = req.body as {
      contactNo?: string;
      name?: string;
      email?: string;
    };

    const normalizedContact = (contactNo || "").replace(/\D/g, "");
    if (normalizedContact.length !== 10) {
      return res.status(400).json({ message: "Enter a valid 10 digit mobile number" });
    }

    let user = await User.findOne({ contactNo: normalizedContact });

    if (user) {
      const nextName = (name || "").trim();
      const nextEmail = (email || "").trim().toLowerCase();
      let shouldUpdate = false;

      if (nextEmail && nextEmail !== user.email) {
        const emailTaken = await User.findOne({
          email: nextEmail,
          _id: { $ne: user._id },
        });
        if (emailTaken) {
          return res.status(400).json({ message: "Email already registered with another user" });
        }
      }

      if (nextName && nextName !== user.name) {
        user.name = nextName;
        shouldUpdate = true;
      }
      if (nextEmail && nextEmail !== user.email) {
        user.email = nextEmail;
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        await user.save();
      }
    } else {
      const nextName = (name || "").trim();
      const nextEmail = (email || "").trim().toLowerCase();

      if (!nextName || !nextEmail) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      const emailTaken = await User.findOne({ email: nextEmail });
      if (emailTaken) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const patientId = `PAT-${Date.now().toString().slice(-8)}`;
      user = await User.create({
        patientId,
        name: nextName,
        email: nextEmail,
        contactNo: normalizedContact,
      });
    }

    const token = generateToken(user._id.toString(), "user");

    return res.json({
      message: "User login successful",
      token,
      role: "user",
      user: {
        id: user._id,
        patientId: user.patientId,
        name: user.name,
        email: user.email,
        contactNo: user.contactNo,
        profileImage: user.profileImage,
      },
    });
  } catch (err: any) {
    console.error("User mobile login error:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};
