import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

const nameRegex = /^[A-Za-z ]+$/;
const contactRegex = /^\d{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export interface IUserResultGalleryItem {
  _id?: string;
  title?: string;
  note?: string;
  beforeImage?: string;
  afterImage?: string;
  uploadedAt?: Date;
}

export interface IUserPrescriptionItem {
  _id?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt?: Date;
}

export interface IUserTestReportItem {
  _id?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt?: Date;
}

export interface IUser extends Document {
    patientId: string;
    name: string;
    email?: string;
    contactNo: string;
    address?: string;
  addresses?: IUserAddress[];
  cartItems?: IUserCartItem[];
  wishlistItems?: IUserCartItem[];
  resultGallery?: IUserResultGalleryItem[];
  prescriptions?: IUserPrescriptionItem[];
  testReports?: IUserTestReportItem[];
  profileImage?: string; // uploaded file path only
  password?: string;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    patientId: { type: String, required: true, unique: true },
    name: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => nameRegex.test(value),
        message: "Patient name should contain only letters and spaces",
      },
    },
    // Optional — but still unique when provided. "sparse" keeps the
    // unique index from colliding on multiple users that all skip email
    // (a non-sparse unique index would treat every missing value as the
    // same "null" and reject the second one).
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (value: string) => !value || emailRegex.test(value),
        message: "Enter a valid email address",
      },
    },
    contactNo: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => contactRegex.test(value),
        message: "Contact No. must contain exactly 10 digits",
      },
    },
    address: { type: String, trim: true, default: "" },
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
    resultGallery: [
      {
        title: { type: String, default: "" },
        note: { type: String, default: "" },
        beforeImage: { type: String, default: "" },
        afterImage: { type: String, default: "" },
        uploadedAt: { type: Date, default: () => new Date() },
      },
    ],
    prescriptions: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, default: "application/pdf" },
        uploadedAt: { type: Date, default: () => new Date() },
      },
    ],
    testReports: [
      {
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        fileType: { type: String, default: "application/pdf" },
        uploadedAt: { type: Date, default: () => new Date() },
      },
    ],
    profileImage: { type: String, trim: true, default: "" },
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
