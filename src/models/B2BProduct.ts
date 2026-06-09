import mongoose, { Schema, model, models, HydratedDocument } from "mongoose";

/* ================= DOCUMENT TYPE ================= */
export interface IB2BProduct {
  _id?: string;

  /* ===== BASIC INFO ===== */
  sku: string;
  productName: string;
  category: string;
  subCategory: string;
  hsnCode: string;
  brandName: string;

  /* ===== PRICING ===== */
  packSize: string;
  pricePerUnit: number;
  bulkPriceTier: string;
  moq: number;
  stockAvailable: number;
  expiryDate: Date;
  shelfLife: string;

  /* ===== DESCRIPTION ===== */
  description: string;
  ingredients: string;
  usageInstructions: string;
  treatmentIndications: string;
  certifications: string;

  /* ===== MANUFACTURER & TAX ===== */
  manufacturerName: string;
  licenseNumber: string;
  mrp: number;
  discountedPrice: number;
  gst: 5 | 12 | 18 | 28;
  taxIncluded: boolean;

  /* ===== MEDIA ===== */
  productImages: string[];
  productVideoUrl: string;
  msds: string;
  customerReviews: string;
  relatedProducts: string;
  promotionalTags: string[];

  createdAt?: Date;
  updatedAt?: Date;
}

export type B2BProductDocument = HydratedDocument<IB2BProduct>;

/* ================= SCHEMA ================= */
const B2BProductSchema = new Schema<B2BProductDocument>(
  {
    sku: { type: String, required: true, unique: true, trim: true },

    productName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Product name should contain only letters and spaces",
      },
    },
    category: { type: String, required: true, trim: true },
    subCategory: { type: String, trim: true },
    hsnCode: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^\d+$/.test(value),
        message: "HSN code must contain digits only",
      },
    },
    brandName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Brand name should contain only letters and spaces",
      },
    },

    packSize: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^\d+$/.test(value),
        message: "Pack size must contain digits only",
      },
    },
    pricePerUnit: { type: Number, required: true, min: 0 },
    bulkPriceTier: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^\d+$/.test(value),
        message: "Bulk price tier must contain digits only",
      },
    },
    moq: { type: Number, required: true, min: 0 },
    stockAvailable: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true },
    shelfLife: { type: String, required: true, trim: true },

    description: { type: String, required: true, trim: true },
    ingredients: { type: String, required: true, trim: true },
    usageInstructions: { type: String, required: true, trim: true },
    treatmentIndications: { type: String, required: true, trim: true },
    certifications: { type: String, trim: true },

    manufacturerName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Manufacturer name should contain only letters and spaces",
      },
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^\d+$/.test(value),
        message: "License number must contain digits only",
      },
    },
    mrp: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, required: true, min: 0 },
    gst: { type: Number, enum: [5, 12, 18, 28], default: 5 },
    taxIncluded: { type: Boolean, default: true },

    productImages: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one product image is required",
      },
    },
    productVideoUrl: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => {
          try {
            const parsed = new URL(value);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "Product video URL must be a valid URL",
      },
    },
    msds: { type: String, trim: true },
    customerReviews: { type: String, trim: true },
    relatedProducts: { type: String, trim: true },
    promotionalTags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

const B2BProductModel =
  (models.B2BProduct as mongoose.Model<B2BProductDocument>) ||
  model<B2BProductDocument>("B2BProduct", B2BProductSchema);

export default B2BProductModel;
