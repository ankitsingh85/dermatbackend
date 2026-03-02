import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUserAddress {
  type: string;
  address: string;
  fullName?: string;
  mobileNo?: string;
  houseNo?: string;
  street?: string;
  localArea?: string;
  pincode?: string;
  district?: string;
  state?: string;
}

export interface IUserCartItem {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  discount?: string;
  discountPrice?: number;
  company?: string;
  image?: string;
  quantity?: number;
}

export interface IUser extends Document {
  patientId: string;
  name: string;
  email: string;
  contactNo?: string;
  address?: string;
  addresses?: IUserAddress[];
  cartItems?: IUserCartItem[];
  wishlistItems?: IUserCartItem[];
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
        address: { type: String, default: "" },
        fullName: { type: String, default: "" },
        mobileNo: { type: String, default: "" },
        houseNo: { type: String, default: "" },
        street: { type: String, default: "" },
        localArea: { type: String, default: "" },
        pincode: { type: String, default: "" },
        district: { type: String, default: "" },
        state: { type: String, default: "" },
      },
    ],
    cartItems: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, default: 0 },
        mrp: { type: Number, default: 0 },
        discount: { type: String, default: "" },
        discountPrice: { type: Number, default: 0 },
        company: { type: String, default: "" },
        image: { type: String, default: "" },
        quantity: { type: Number, default: 1, min: 1 },
      },
    ],
    wishlistItems: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, default: 0 },
        mrp: { type: Number, default: 0 },
        discount: { type: String, default: "" },
        discountPrice: { type: Number, default: 0 },
        company: { type: String, default: "" },
        image: { type: String, default: "" },
        quantity: { type: Number, default: 1, min: 1 },
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
