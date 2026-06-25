import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;

const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ================= INTERFACE ================= */

export interface IAdmin extends Document {
  empId: string;

  name: string;

  email: string;

  phone?: string;

  password: string;

  resetOtp?: string;

resetOtpExpire?: Date;

  role: "admin" | "superadmin" | "manager";

  lastModifiedAt?: Date;

  lastModifiedField?: string;


  
  comparePassword(password: string): Promise<boolean>;
}

/* ================= SCHEMA ================= */

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

    /* ACCESS LEVEL OPTIONAL */

    role: {
      type: String,

      enum: ["admin", "superadmin", "manager"],

      default: "admin",
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

/* ================= AUTO ADMIN CODE ================= */

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
