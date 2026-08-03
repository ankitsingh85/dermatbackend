import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ================= ADMIN PANEL MODULES =================
   These match the actual left-panel sidebar modules in the admin
   dashboard (see dashboardModules in the SuperAdminDashboard page).
   Each module gets its own View / Create-Modify / Delete checkboxes
   in the permissions table.
*/
export const ADMIN_MODULES = [
  "admin",
  "user",
  "productCategory",
  "product",
  "courseType",
  "trainingType",
  "course",
  "workshopTraining",
  "doctor",
  "clinicCategory",
  "clinic",
  "b2bUser",
  "b2bProductCategory",
  "b2bProduct",
  "serviceCategory",
  "treatment",
  "onlineConsultationService",
  // Groups the "OTHERS" sidebar dropdown (Top Products, Offers,
  // Featured Section, Shorts, Hiring Requests) under a single permission toggle.
  "others",
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

// Human-readable labels for the permission table / any UI that needs
// to display a module nicely instead of its raw key.
export const ADMIN_MODULE_LABELS: Record<string, string> = {
  admin: "Admin",
  user: "User",
  productCategory: "Product Category",
  product: "Product",
  courseType: "Course Type",
  trainingType: "Training Type",
  course: "Course",
  workshopTraining: "Workshop Training",
  doctor: "Doctor",
  clinicCategory: "Clinic Category",
  clinic: "Clinic",
  b2bUser: "B2B User",
  b2bProductCategory: "B2B Product Category",
  b2bProduct: "B2B Product",
  serviceCategory: "Treatment Category",
  treatment: "Treatment Plans",
  onlineConsultationService: "Online Consultation Services",
  others: "Others (Top Products, Offers, Featured Section, Shorts, Hiring Requests)",
};

export interface IAdminPermission {
  module: string;
  view: boolean;
  create: boolean; // covers create + modify/edit
  delete: boolean;
}

/* ================= INTERFACE ================= */

export interface IAdmin extends Document {
  empId: string;

  name: string;

  email: string;

  phone?: string;

  password: string;

  resetOtp?: string;

  resetOtpExpire?: Date;

  // Fixed tiers are "superadmin" and "admin" (System Admin). Anything
  // else (e.g. "manager" or a custom typed role like "support-staff")
  // falls into the "any other category" bucket that uses the
  // permissions table below.
  role: string;

  // Free-text label shown in the UI when a custom role name was typed
  // instead of picking "Manager" from the dropdown (e.g. "Support Staff").
  customRoleLabel?: string;

  // Per-module access grants. Ignored / forced to full-access for
  // role === "superadmin".
  permissions: IAdminPermission[];

  lastModifiedAt?: Date;

  lastModifiedField?: string;

  comparePassword(password: string): Promise<boolean>;
}

/* ================= HELPERS ================= */

export const buildFullAccessPermissions = (): IAdminPermission[] =>
  ADMIN_MODULES.map((module) => ({
    module,
    view: true,
    create: true,
    delete: true,
  }));

export const buildEmptyPermissions = (): IAdminPermission[] =>
  ADMIN_MODULES.map((module) => ({
    module,
    view: false,
    create: false,
    delete: false,
  }));

// Always returns a complete permissions array covering every module,
// even if the caller only sent a partial list — missing modules default
// to no access instead of being silently dropped.
export const normalizePermissions = (value: unknown): IAdminPermission[] => {
  let parsed: any[] = [];

  if (Array.isArray(value)) {
    parsed = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const json = JSON.parse(value);
      if (Array.isArray(json)) parsed = json;
    } catch {
      parsed = [];
    }
  }

  const byModule = new Map<string, IAdminPermission>();
  for (const item of parsed) {
    const moduleName = String(item?.module ?? "").trim();
    if (!moduleName) continue;
    byModule.set(moduleName, {
      module: moduleName,
      view: Boolean(item?.view),
      create: Boolean(item?.create),
      delete: Boolean(item?.delete),
    });
  }

  return ADMIN_MODULES.map(
    (module) =>
      byModule.get(module) || { module, view: false, create: false, delete: false }
  );
};

/* ================= SCHEMA ================= */

const AdminPermissionSchema = new Schema<IAdminPermission>(
  {
    module: { type: String, required: true },
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

const adminSchema = new Schema<IAdmin>(
  {
    /* ADMIN ID */

    empId: {
      type: String,

      unique: true,
    },

    /* NAME REQUIRED */

    name: {
      type: String,

      required: true,

      trim: true,

      validate: {
        validator: (value: string) => nameRegex.test(value),

        message: "Name should contain only letters",
      },
    },

    /* EMAIL REQUIRED */

    email: {
      type: String,

      required: true,

      unique: true,

      lowercase: true,

      trim: true,
    },

    /* PHONE OPTIONAL */

    phone: {
      type: String,

      required: false,

      trim: true,

      validate: {
        validator: (value: string) => {
          if (!value) return true;

          return phoneRegex.test(value);
        },

        message: "Contact No. must contain exactly 10 digits",
      },
    },

    /* PASSWORD REQUIRED */

    password: {
      type: String,

      required: true,

      select: false,

      validate: {
        validator: function (value: string) {
          // already hashed password skip check

          if (value.startsWith("$2")) return true;

          return passwordRegex.test(value);
        },

        message: "Password must contain letter number symbol",
      },
    },

    resetOtp: {
      type: String,
      select: false,
    },

    resetOtpExpire: {
      type: Date,
      select: false,
    },

    /* ACCESS LEVEL — flexible string so custom role names are allowed.
       "superadmin" and "admin" (System Admin) are the two fixed/protected
       tiers; anything else is treated as "any other category" and uses
       the permissions table. */
    role: {
      type: String,
      trim: true,
      lowercase: true,
      default: "manager",
    },

    customRoleLabel: {
      type: String,
      trim: true,
      default: "",
    },

    permissions: {
      type: [AdminPermissionSchema],
      default: () => buildEmptyPermissions(),
    },

    /* LAST UPDATE */

    lastModifiedAt: {
      type: Date,
    },

    lastModifiedField: {
      type: String,
    },
  },

  {
    timestamps: true,
  },
);

/* ================= AUTO ADMIN CODE + PERMISSION LOCK ================= */

adminSchema.pre(
  "save",

  async function (next) {
    /* CREATE ADMIN ID */

    if (this.isNew) {
      const now = new Date();

      const year = now.getFullYear();

      const month = String(now.getMonth() + 1).padStart(2, "0");

      const prefix = `AdmUser-${year}${month}`;

      const lastAdmin = await mongoose
        .model("Admin")
        .findOne({
          empId: {
            $regex: `^${prefix}`,
          },
        })
        .sort({
          createdAt: -1,
        });

      let nextNo = 1;

      if (lastAdmin?.empId) {
        const oldNo = Number(lastAdmin.empId.split("-")[2]);

        nextNo = oldNo + 1;
      }

      this.empId = `${prefix}-${nextNo}`;
    }

    /* SUPER ADMIN ALWAYS GETS FULL ACCESS — regardless of whatever
       permissions payload the client sent. This is enforced here so it
       can never be downgraded by a bad request. */
    if (this.role === "superadmin") {
      this.permissions = buildFullAccessPermissions();
    } else if (this.isModified("permissions") && !this.permissions?.length) {
      this.permissions = buildEmptyPermissions();
    }

    /* PASSWORD CHANGE */

    if (this.isModified("password")) {
      this.password = await bcrypt.hash(this.password, 10);

      this.lastModifiedAt = new Date();

      this.lastModifiedField = "Password Changed";
    }

    /* NAME CHANGE */

    if (this.isModified("name")) {
      this.lastModifiedAt = new Date();

      this.lastModifiedField = "Name Changed";
    }

    /* ACCESS CHANGE */

    if (this.isModified("role")) {
      this.lastModifiedAt = new Date();

      this.lastModifiedField = "Access Level Changed";
    }

    if (this.isModified("permissions") && this.role !== "superadmin") {
      this.lastModifiedAt = new Date();

      this.lastModifiedField = "Permissions Changed";
    }

    next();
  },
);

/* ================= PASSWORD MATCH ================= */

adminSchema.methods.comparePassword = async function (enteredPassword: string) {
  return bcrypt.compare(
    enteredPassword,

    this.password,
  );
};

export default mongoose.models.Admin ||
  mongoose.model<IAdmin>(
    "Admin",

    adminSchema,
  );
