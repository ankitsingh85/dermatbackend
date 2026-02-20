import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUserAddress {
  type: string;
  address: string;
}

export interface IUser extends Document {
  patientId: string;
  name: string;
  email: string;
  contactNo?: string;
  address?: string;
  addresses?: IUserAddress[];
  profileImage?: string; // ✅ BASE64 STRING
  password?: string;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    patientId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    contactNo: { type: String, trim: true, sparse: true },
    address: { type: String },
    addresses: [
      {
        type: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
        address: { type: String, required: true },
      },
    ],
    profileImage: { type: String }, // BASE64
    password: { type: String, select: false },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (enteredPassword: string) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
