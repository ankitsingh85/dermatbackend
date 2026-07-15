import express from "express";
import crypto from "crypto";
import Admin, {
  ADMIN_MODULES,
  ADMIN_MODULE_LABELS,
  normalizePermissions,
} from "../models/admin";
import { createAdmin } from "../controllers/adminController";
import { sendMail } from "../utils/email";

const router = express.Router();

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const FIXED_ROLES = ["superadmin", "admin"] as const;

const hashOtp = (otp: string) =>
  crypto.createHash("sha256").update(otp).digest("hex");

/* ================= CREATE ADMIN ================= */

router.post("/", createAdmin);

/* ================= LIST ADMINS ================= */

router.get("/", async (_req, res) => {
  try {
    const admins = await Admin.find()
      .select(
        "empId name email phone role customRoleLabel permissions lastModifiedAt lastModifiedField createdAt updatedAt",
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

        customRoleLabel: admin.customRoleLabel || "",

        permissions: admin.permissions || [],

        // Surfaced so the frontend can disable the delete button for
        // Super Admin rows without guessing from role alone.
        isDeletable: admin.role !== "superadmin",

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

/* ================= AVAILABLE MODULES (for building the permission table) ================= */

router.get("/modules", async (_req, res) => {
  res.json({ modules: ADMIN_MODULES, labels: ADMIN_MODULE_LABELS });
});

/* ================= FORGOT PASSWORD: SEND EMAIL OTP ================= */

router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const admin = await Admin.findOne({ email }).select("+resetOtp +resetOtpExpire");

    if (!admin) {
      return res.status(404).json({
        message: "Admin email not found",
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    admin.resetOtp = hashOtp(otp);
    admin.resetOtpExpire = new Date(Date.now() + 10 * 60 * 1000);

    await admin.save();

    await sendMail(
      email,
      "Admin password reset OTP",
      `Your Dr Dermat admin password reset OTP is ${otp}. It is valid for 10 minutes. If you did not request this, please ignore this email.`,
    );

    res.json({
      message: "Verification OTP sent to your email",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Unable to send reset OTP",
    });
  }
});

/* ================= FORGOT PASSWORD: VERIFY OTP AND RESET ================= */

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const otp = String(req.body?.otp ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!email || !otp || !password) {
      return res.status(400).json({
        message: "Email, OTP and password are required",
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "Enter a valid 6 digit OTP",
      });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be 8 characters with letter, number and symbol",
      });
    }

    const admin = await Admin.findOne({ email }).select(
      "+password +resetOtp +resetOtpExpire",
    );

    if (!admin) {
      return res.status(404).json({
        message: "Admin email not found",
      });
    }

    if (
      !admin.resetOtp ||
      !admin.resetOtpExpire ||
      admin.resetOtpExpire.getTime() < Date.now()
    ) {
      return res.status(400).json({
        message: "OTP expired. Please request a new OTP",
      });
    }

    if (admin.resetOtp !== hashOtp(otp)) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    admin.password = password;
    admin.resetOtp = undefined;
    admin.resetOtpExpire = undefined;

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

/* ================= GET SINGLE ADMIN (used by the dashboard to load
   the logged-in admin's own role/permissions after decoding the JWT) ================= */

router.get("/:id", async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        empId: admin.empId,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        customRoleLabel: admin.customRoleLabel || "",
        permissions: admin.permissions || [],
        isDeletable: admin.role !== "superadmin",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch admin" });
  }
});

/* ================= UPDATE ADMIN ================= */

router.put("/:id", async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("+password");

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    const { name, email, phone, role, accessLevel, customRoleLabel, permissions, password } =
      req.body;

    const previousRole = admin.role;

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

    // Accept either `role` or the older `accessLevel` field name.
    const nextRole = role ?? accessLevel;
    if (nextRole) {
      const cleanRole = String(nextRole).trim().toLowerCase();
      admin.role = cleanRole;
      admin.customRoleLabel = FIXED_ROLES.includes(cleanRole as any)
        ? ""
        : String(customRoleLabel ?? admin.customRoleLabel ?? "").trim();

      admin.lastModifiedField = "Access Level Changed";
    } else if (
      customRoleLabel !== undefined &&
      !FIXED_ROLES.includes(admin.role as any)
    ) {
      admin.customRoleLabel = String(customRoleLabel).trim();
    }

    if (permissions !== undefined) {
      // Super Admin's permissions can't be downgraded via this route —
      // the model's pre-save hook re-forces full access for that role
      // anyway, but we skip the wasted work here too.
      if (admin.role !== "superadmin") {
        admin.permissions = normalizePermissions(permissions);
      }
    } else if (previousRole === "superadmin" && admin.role !== "superadmin") {
      // Demoted away from Super Admin without an explicit permissions
      // payload — don't silently leave the old full-access grant in
      // place. Reset to no access and require the caller to explicitly
      // re-grant module permissions for the new role.
      admin.permissions = normalizePermissions([]);
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
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    // Super Admin accounts can never be deleted — enforced here, not
    // just hidden in the UI, so a direct API call can't bypass it.
    if (admin.role === "superadmin") {
      return res.status(403).json({
        message: "Super Admin accounts cannot be deleted",
      });
    }

    await Admin.findByIdAndDelete(req.params.id);

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
