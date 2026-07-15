import mongoose, { Schema, model, models, HydratedDocument } from "mongoose";

/* ================= DOCUMENT TYPE ================= */
export interface IB2BProduct {
  _id?: string;

  /* ===== BASIC INFO =====
     Only productName, category and discountedPrice are mandatory —
     everything else here is optional at creation time. */
  sku: string;
  productName: string;
  category: string[];
  subCategory?: string;
  hsnCode?: string;
  brandName?: string;

  /* ===== PRICING ===== */
  packSize?: string;
  pricePerUnit?: number;
  bulkPriceTier?: string;
  moq?: number;
  stockAvailable?: number;
  expiryDate?: Date;
  shelfLife?: string;

  /* ===== DESCRIPTION ===== */
  description?: string;
  ingredients?: string;
  usageInstructions?: string;
  treatmentIndications?: string;
  certifications?: string;

  /* ===== MANUFACTURER & TAX ===== */
  manufacturerName?: string;
  licenseNumber?: string;
  mrp?: number;
  discountedPrice: number;
  gst: number;
  taxIncluded: boolean;

  /* ===== MEDIA ===== */
  productImages?: string[];
  productVideoUrl?: string;
  msds?: string;
  customerReviews?: string;
  relatedProducts?: string;
  promotionalTags?: string[];

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
    // Multi-select category support: a product can now belong to
    // multiple categories at once.
    category: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one category is required",
      },
    },
    subCategory: { type: String, trim: true },
    hsnCode: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^\d+$/.test(value),
        message: "HSN code must contain digits only",
      },
    },
    brandName: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^[A-Za-z ]+$/.test(value),
        message: "Brand name should contain only letters and spaces",
      },
    },

    // Pack size / quantity now accepts numbers, symbols, and text
    // (e.g. "10x5 ml", "Box of 24", "500g") instead of digits only.
    packSize: { type: String, trim: true },

    pricePerUnit: { type: Number, min: 0 },
    bulkPriceTier: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^\d+$/.test(value),
        message: "Bulk price tier must contain digits only",
      },
    },
    moq: { type: Number, min: 0 },
    stockAvailable: { type: Number, min: 0 },
    expiryDate: { type: Date },
    shelfLife: { type: String, trim: true },

    description: { type: String, trim: true },
    ingredients: { type: String, trim: true },
    usageInstructions: { type: String, trim: true },
    treatmentIndications: { type: String, trim: true },
    certifications: { type: String, trim: true },

    manufacturerName: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^[A-Za-z ]+$/.test(value),
        message: "Manufacturer name should contain only letters and spaces",
      },
    },
    licenseNumber: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^\d+$/.test(value),
        message: "License number must contain digits only",
      },
    },
    mrp: { type: Number, min: 0 },
    discountedPrice: { type: Number, required: true, min: 0 },

    // GST is now a free-form percentage (0-100). The frontend still offers
    // common presets via a dropdown, plus a "Custom" option that reveals a
    // text field for any other percentage.
    gst: { type: Number, min: 0, max: 100, default: 5 },
    taxIncluded: { type: Boolean, default: true },

    productImages: { type: [String], default: [] },
    productVideoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => {
          if (!value) return true;
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