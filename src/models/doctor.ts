import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IDoctor extends Document {
  title: string;
  firstName: string;
  lastName: string;
  doctorCode: string;
  specialist: string;
  email: string;
  phone?: string;
  password: string;
  description?: string;
  profileImage?: string;
  address?: string;
  addresses?: {
    type: string;
    address?: string;
    fullName?: string;
    mobileNo?: string;
    houseNo?: string;
    street?: string;
    localArea?: string;
    pincode?: string;
    district?: string;
    state?: string;
  }[];
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    doctorCode: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },

    specialist: {
      type: String,
      required: true,
      trim: true,
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
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    description: {
      type: String,
      trim: true,
    },

    profileImage: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
    },

    addresses: [
      {
        type: { type: String, default: "Office", trim: true },
        address: { type: String, trim: true },
        fullName: { type: String, trim: true },
        mobileNo: { type: String, trim: true },
        houseNo: { type: String, trim: true },
        street: { type: String, trim: true },
        localArea: { type: String, trim: true },
        pincode: { type: String, trim: true },
        district: { type: String, trim: true },
        state: { type: String, trim: true },
      },
    ],
  },
  { timestamps: true }
);

/* ===== HASH PASSWORD ===== */
DoctorSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ===== COMPARE PASSWORD ===== */
DoctorSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IDoctor>("Doctor", DoctorSchema);
