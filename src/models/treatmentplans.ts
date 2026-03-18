import mongoose, { Document, Schema } from "mongoose";

export interface ITreatmentPlan extends Document {
  tuc: string;
  treatmentName: string;
  slug?: string;
  clinic: mongoose.Types.ObjectId;
  description?: string;
  treatmentImages: string[];
  beforeImages: string[];
  afterImages: string[];
  shortReelUrl?: string;
  serviceCategory?: string;
  categoryIcons: string[];
  mrp?: number;
  offerPrice?: number;
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
    tuc: { type: String, required: true, unique: true },
    treatmentName: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true, trim: true },
    clinic: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    description: { type: String, default: "" },

    treatmentImages: { type: [String], default: [] },
    beforeImages: { type: [String], default: [] },
    afterImages: { type: [String], default: [] },
    shortReelUrl: { type: String, default: "" },

    serviceCategory: { type: String, default: "" },
    categoryIcons: { type: [String], default: [] },

    mrp: { type: Number },
    offerPrice: { type: Number },
    pricePerSession: { type: Number },
    discountPercent: { type: Number },

    sessions: { type: String, default: "" },
    duration: { type: String, default: "" },
    validity: { type: String, default: "" },
    technologyUsed: { type: String, default: "" },

    gender: {
      type: String,
      enum: ["Unisex", "Male", "Female"],
      default: "Unisex",
    },
    promoCode: { type: String, default: "" },

    addToCart: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.TreatmentPlan ||
  mongoose.model<ITreatmentPlan>("TreatmentPlan", TreatmentPlanSchema);
