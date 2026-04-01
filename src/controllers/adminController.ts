import { Request, Response } from "express";
import Admin from "../models/admin";

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ================= CREATE ADMIN ================= */
export const createAdmin = async (req: Request, res: Response) => {
  try {
    const { empId, name, email, phone, password, accessLevel } = req.body;

    const cleanName = String(name ?? "").trim();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanPhone = String(phone ?? "").trim();
    const cleanPassword = String(password ?? "");
    const cleanAccessLevel = String(accessLevel ?? "admin").trim().toLowerCase();
    const resolvedEmpId = empId
      ? String(empId).trim()
      : `ADM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (!cleanName || !cleanEmail || !cleanPhone || !cleanPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!nameRegex.test(cleanName)) {
      return res
        .status(400)
        .json({ message: "Name should contain only letters and spaces" });
    }

    if (!phoneRegex.test(cleanPhone)) {
      return res
        .status(400)
        .json({ message: "Contact No. must contain exactly 10 digits" });
    }

    if (!passwordRegex.test(cleanPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include a letter, a number, and a symbol",
      });
    }

    const existingAdmin = await Admin.findOne({
      $or: [{ email: cleanEmail }, { empId: resolvedEmpId }],
    });

    if (existingAdmin) {
      return res.status(400).json({
        message: "Admin with same email or ID already exists",
      });
    }

    const role = ["admin", "superadmin", "manager"].includes(cleanAccessLevel)
      ? cleanAccessLevel
      : "admin";

    const admin = await Admin.create({
      empId: resolvedEmpId,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      password: cleanPassword,
      role,
    });

    return res.status(201).json({
      message: "Admin created successfully",
      admin,
    });
  } catch (error) {
    console.error("Create Admin Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
