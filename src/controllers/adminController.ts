import { Request, Response } from "express";
import Admin, {
  buildFullAccessPermissions,
  normalizePermissions,
} from "../models/admin";

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "superadmin" and "admin" (System Admin) are the two fixed/protected
// tiers. Anything else (e.g. "manager" or a custom typed role) is
// treated as "any other category" and keeps its custom label.
const FIXED_ROLES = ["superadmin", "admin"] as const;

/* ================= CREATE ADMIN =================
   NOTE (security/TODO): this does not currently check WHO is making the
   request — e.g. only a Super Admin should be able to create another
   Super Admin or a System Admin. There's no admin auth middleware
   wired in yet. Once you have one (e.g. authAdmin), validate
   req.admin.role here before allowing role escalation, the same way
   userAuth guards the user routes.
*/
export const createAdmin = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role, accessLevel, customRoleLabel, permissions } =
      req.body;

    const cleanName = String(name ?? "").trim();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim() : "";
    const cleanPassword = String(password ?? "");

    // Accept either `role` (new field name used by the updated
    // CreateAdmin form) or the older `accessLevel` field name, for
    // backward compatibility.
    const cleanRole = String(role ?? accessLevel ?? "manager").trim().toLowerCase();
    const cleanCustomRoleLabel = String(customRoleLabel ?? "").trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    if (!nameRegex.test(cleanName)) {
      return res
        .status(400)
        .json({ message: "Name should contain only letters and spaces" });
    }

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    // Phone is optional (matches models/admin.ts), but if provided it
    // must be a valid 10-digit number.
    if (cleanPhone && !phoneRegex.test(cleanPhone)) {
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

    const existingAdmin = await Admin.findOne({ email: cleanEmail });

    if (existingAdmin) {
      return res.status(400).json({
        message: "An admin with this email already exists",
      });
    }

    // Super Admin always gets full access; anything else uses whatever
    // permissions matrix was submitted (normalized to cover every
    // module, defaulting missing ones to no access).
    const resolvedPermissions =
      cleanRole === "superadmin"
        ? buildFullAccessPermissions()
        : normalizePermissions(permissions);

    const admin = await Admin.create({
      name: cleanName,
      email: cleanEmail,
      ...(cleanPhone ? { phone: cleanPhone } : {}),
      password: cleanPassword,
      role: cleanRole,
      // Only keep a custom label when the role isn't one of the fixed
      // tiers — e.g. role "manager" with label "Support Staff".
      customRoleLabel: FIXED_ROLES.includes(cleanRole as any)
        ? ""
        : cleanCustomRoleLabel,
      permissions: resolvedPermissions,
      // empId is intentionally NOT set here — the model's pre("save")
      // hook always generates/overwrites it for new documents.
    });

    return res.status(201).json({
      message: "Admin created successfully",
      admin: {
        _id: admin._id,
        empId: admin.empId,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        customRoleLabel: admin.customRoleLabel,
        permissions: admin.permissions,
      },
    });
  } catch (error: any) {
    console.error("Create Admin Error:", error);

    if (error?.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || "field";
      const value = error.keyValue?.[field];
      return res.status(400).json({
        message: `An admin with this ${field} already exists (${value}).`,
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};