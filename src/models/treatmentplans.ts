import mongoose, { Document, Schema } from "mongoose";

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

export interface ITreatmentPlan extends Document {
  tuc: string;

  treatmentName: string;

  slug?: string;

  // MULTIPLE CLINIC
  clinic: mongoose.Types.ObjectId[];

  description?: string;

  treatmentImages: string[];

  beforeImages: string[];

  afterImages: string[];

  shortReelUrl?: string;

  // MULTIPLE CATEGORY
  serviceCategory: string[];

  categoryIcons: string[];

  mrp?: number;

  offerPrice: number;

  pricePerSession?: number;

  discountPercent?: number;

  sessions?: string;

  duration?: string;

  validity?: string;

  technologyUsed?: string;

  gender: "Unisex" | "Male" | "Female";

  promoCode?: string;

  addToCart: boolean;

  isActive: boolean;
}

const TreatmentPlanSchema = new Schema<ITreatmentPlan>(
  {
    tuc: {
      type: String,
      required: true,
      unique: true,
    },

    treatmentName: {
      type: String,

      required: true,

      trim: true,

      validate: {
        validator: (value: string) => textOnlyRegex.test(value),

        message: "Treatment plan name should contain only letters and spaces",
      },
    },

    slug: {
      type: String,
      unique: true,
      sparse: true,
    },

    clinic: [
      {
        type: Schema.Types.ObjectId,

        ref: "Clinic",

        required: true,
      },
    ],

    description: {
      type: String,
      default: "",
    },

    treatmentImages: {
      type: [String],
      default: [],
    },

    beforeImages: {
      type: [String],
      default: [],
    },

    afterImages: {
      type: [String],
      default: [],
    },

    shortReelUrl: {
      type: String,

      default: "",

      validate: {
        validator: (value: string) => !value || isValidUrl(value),

        message: "Invalid reel url",
      },
    },

    serviceCategory: {
      type: [String],

      required: true,

      default: [],
    },

    categoryIcons: {
      type: [String],
      default: [],
    },

    mrp: Number,

    offerPrice: {
      type: Number,
      required: true,
    },

    pricePerSession: Number,

    discountPercent: Number,

    sessions: {
      type: String,

      default: "",

      validate: {
        validator: (value: string) => !value || digitsOnlyRegex.test(value),

        message: "Sessions must contain digits only",
      },
    },

    duration: {
      type: String,
      default: "",
    },

    validity: {
      type: String,
      default: "",
    },

    technologyUsed: {
      type: String,
      default: "",
    },

    gender: {
      type: String,

      enum: ["Unisex", "Male", "Female"],

      default: "Unisex",
    },

    promoCode: {
      type: String,
      default: "",
    },

    addToCart: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },

  {
    timestamps: true,
  },
);

export default mongoose.models.TreatmentPlan ||
  mongoose.model<ITreatmentPlan>("TreatmentPlan", TreatmentPlanSchema);
