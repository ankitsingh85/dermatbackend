import mongoose, { Schema, model, models, HydratedDocument } from "mongoose";

const textOnlyRegex = /^[A-Za-z ]+$/;
// const digitsOnlyRegex = /^\d+$/;

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/* ================= REVIEW ================= */

export interface IReview {
  rating: number;

  comment: string;

  user: string;

  createdAt?: Date;

  updatedAt?: Date;
}

/* ================= PRODUCT ================= */

export interface IProduct {
  _id?: string;

  /* BASIC */

productSKU:string;
  productName: string;

  // MULTIPLE CATEGORY

  category: string[];

  brandName: string;

  /* DESCRIPTION */

  description: string;

  ingredients: string;

  targetConcerns: string;

  usageInstructions: string;

  benefits: string;

  certifications: string;

  /* PRICING */

  netQuantity: string;

  // NEW FIELD

  quantityUnit: string;

  mrpPrice: number;

  discountedPrice: number;

  discountPercent: number;

  taxPercent: number;

  /* COMPLIANCE */

  expiryDate: Date;

  manufacturerName: string;
licenseNumber: string;

hsnCode: string;

packagingType: string;

  /* MEDIA */

  productImages: string[];

  productShortVideo?: string;

  /* META */

  gender: string;

  skinHairType: string;

  barcode: string;

  /* SYSTEM */

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

/* ================= REVIEW SCHEMA ================= */

const ReviewSchema = new Schema<IReview>(
  {
    rating: {
      type: Number,
      required: true,
    },

    comment: {
      type: String,
      required: true,
    },

    user: {
      type: String,
      required: true,
    },

    createdAt: {
      type: Date,
      default: () => new Date(),
    },

    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
  },

  {
    _id: false,
  },
);

export type ProductDocument = HydratedDocument<IProduct>;

/* ================= PRODUCT SCHEMA ================= */

const ProductSchema = new Schema<ProductDocument>(
  {
    productSKU: {
      type: String,

      required: true,

      unique: true,
    },

    productName: {
      type: String,

      required: true,

      trim: true,

      validate: {
        validator: (value: string) => textOnlyRegex.test(value),

        message: "Product name should contain only letters",
      },
    },

    /* MULTIPLE CATEGORY */

    category: {
      type: [String],

      required: true,

      default: [],
    },

    brandName: {
      type: String,

      trim: true,

      validate: {
        validator: (value: string) => !value || textOnlyRegex.test(value),

        message: "Brand name should contain only letters",
      },
    },

    description: String,

    ingredients: String,

    targetConcerns: String,

    usageInstructions: String,

    benefits: String,

    certifications: String,

    /* PRICE */

    netQuantity: String,

    quantityUnit: {
      type: String,

      enum: ["Nos", "Qty", "ML", "Grams", "KG", "Litre"],

      default: "Nos",
    },

    mrpPrice: Number,

    discountedPrice: {
      type: Number,

      required: true,
    },

    discountPercent: Number,

    taxPercent: {
      type: Number,

      default: 0,
    },

    /* COMPLIANCE */

    expiryDate: Date,

    manufacturerName: {
      type: String,

      trim: true,

      validate: {
        validator: (value: string) => !value || textOnlyRegex.test(value),
      },
    },

   licenseNumber: {
  type: String,

  trim: true,
},


hsnCode: {
  type: String,

  trim: true,
},

    packagingType: {
      type: String,

      trim: true,
    },

    /* MEDIA */

    productImages: {
      type: [String],

      default: [],
    },

    productShortVideo: {
      type: String,

      validate: {
        validator: (value: string) => !value || isValidUrl(value),
      },
    },

    gender: {
      type: String,

      default: "Unisex",
    },

    skinHairType: String,

    barcode: String,

    rating: {
      type: Number,

      default: 0,
    },

    shippingTime: {
      type: String,

      default: "5-7 Business Days",
    },

    returnPolicy: {
      type: String,

      default: "No Return Policy",
    },

    availabilityStatus: {
      type: String,

      default: "Available",
    },

    stockStatus: {
      type: String,

      default: "In Stock",
    },

    activeStatus: {
      type: Boolean,

      default: true,
    },

    buyNow: {
      type: Boolean,

      default: true,
    },

    checkAvailability: {
      type: Boolean,

      default: true,
    },

    dermatologistRecommended: {
      type: Boolean,

      default: false,
    },

    reviews: {
      type: [ReviewSchema],

      default: [],
    },
  },

  {
    timestamps: true,
  },
);

const ProductModel =
  (models.Product as mongoose.Model<ProductDocument>) ||
  model<ProductDocument>("Product", ProductSchema);

export default ProductModel;
