import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

const nameRegex = /^[A-Za-z ]+$/;
const phoneRegex = /^\d{10}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export interface IAdmin extends Document {
  empId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "admin" | "superadmin" | "manager";
  comparePassword(password: string): Promise<boolean>;
}

const adminSchema = new Schema<IAdmin>(
  {
    empId: {
      type: String,
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => nameRegex.test(value),
        message: "Name should contain only letters and spaces",
      },
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => phoneRegex.test(value),
        message: "Contact No. must contain exactly 10 digits",
      },
    },

    password: {
      type: String,
      required: true,
      select: false,
      validate: {
        validator: (value: string) => passwordRegex.test(value),
        message:
          "Password must be at least 8 characters and include a letter, a number, and a symbol",
      },
    },

    role: {
      type: String,
      enum: ["admin", "superadmin", "manager"],
      default: "admin",
    },
  },
  { timestamps: true }
);

/* ===== HASH PASSWORD ===== */
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ===== COMPARE PASSWORD ===== */
adminSchema.methods.comparePassword = async function (
  enteredPassword: string
) {
  return bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model<IAdmin>("Admin", adminSchema);
