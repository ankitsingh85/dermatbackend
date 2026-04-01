import mongoose, { Schema, model, models, HydratedDocument } from "mongoose";

const textOnlyRegex = /^[A-Za-z ]+$/;
const digitsOnlyRegex = /^\d+$/;
const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/** ================= REVIEW INTERFACE ================= */
export interface IReview {
  rating: number;
  comment: string;
  user: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** ================= PRODUCT INTERFACE ================= */
export interface IProduct {
  _id?: string;

  /* ===== BASIC INFO ===== */
  productSKU: string;
  productName: string;
  category: string;
  // subCategory: string; ❌ removed logically
  brandName: string;

  /* ===== DESCRIPTION ===== */
  description: string;
  ingredients: string;
  targetConcerns: string;
  usageInstructions: string;
  benefits: string;
  certifications: string;

  /* ===== PRICING ===== */
  netQuantity: string;
  mrpPrice: number;
  discountedPrice: number;
  discountPercent: number;
  taxPercent: number;

  /* ===== COMPLIANCE ===== */
  expiryDate: Date;
  manufacturerName: string;
  licenseNumber: string;
  packagingType: string;

  /* ===== MEDIA ===== */
  productImages: string[];
  productShortVideo?: string;

  /* ===== META ===== */
  gender: string;
  skinHairType: string;
  barcode: string;

  /* ===== SYSTEM CONTROLLED ===== */
  rating: number;
  shippingTime: string;
  returnPolicy: string;
  availabilityStatus: string;
  stockStatus: string;
  activeStatus: boolean;
  buyNow: boolean;
  checkAvailability: boolean;
  dermatologistRecommended: boolean;

  reviews: IReview[];

  createdAt?: Date;
  updatedAt?: Date;
}

/** ================= REVIEW SCHEMA ================= */
const ReviewSchema = new Schema<IReview>(
  {
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
    user: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

/** ================= PRODUCT SCHEMA ================= */
const ProductSchema = new Schema<ProductDocument>(
  {
    productSKU: { type: String, required: true, unique: true },
    productName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => textOnlyRegex.test(value),
        message: "Product name should contain only letters and spaces",
      },
    },
    category: { type: String, required: true },
    // subCategory: { type: String }, ❌ intentionally disabled
    brandName: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || textOnlyRegex.test(value),
        message: "Brand name should contain only letters and spaces",
      },
    },

    description: { type: String },
    ingredients: { type: String },
    targetConcerns: { type: String },
    usageInstructions: { type: String },
    benefits: { type: String },
    certifications: { type: String },

    netQuantity: { type: String },
    mrpPrice: { type: Number },
    discountedPrice: { type: Number },
    discountPercent: { type: Number },
    taxPercent: { type: Number, default: 0 },

    expiryDate: { type: Date },
    manufacturerName: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || textOnlyRegex.test(value),
        message: "Manufacturer name should contain only letters and spaces",
      },
    },
    licenseNumber: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || digitsOnlyRegex.test(value),
        message: "License number must contain digits only",
      },
    },
    packagingType: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || textOnlyRegex.test(value),
        message: "Packaging type should contain only letters and spaces",
      },
    },

    productImages: { type: [String], default: [] },
    productShortVideo: {
      type: String,
      validate: {
        validator: (value: string) => !value || isValidUrl(value),
        message: "Product short video must be a valid URL",
      },
    },

    gender: { type: String, default: "Unisex" },
    skinHairType: { type: String },
    barcode: { type: String },

    rating: { type: Number, default: 0 },
    shippingTime: { type: String, default: "5-7 Business Days" },
    returnPolicy: { type: String, default: "No Return Policy" },
    availabilityStatus: { type: String, default: "Available" },
    stockStatus: { type: String, default: "In Stock" },
    activeStatus: { type: Boolean, default: true },
    buyNow: { type: Boolean, default: true },
    checkAvailability: { type: Boolean, default: true },
    dermatologistRecommended: { type: Boolean, default: false },

    reviews: { type: [ReviewSchema], default: [] },
  },
  { timestamps: true }
);

export type ProductDocument = HydratedDocument<IProduct>;

const ProductModel =
  (models.Product as mongoose.Model<ProductDocument>) ||
  model<ProductDocument>("Product", ProductSchema);

export default ProductModel;
