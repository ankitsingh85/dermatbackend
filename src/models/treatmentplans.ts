import mongoose, { Document, Schema } from "mongoose";

export interface ITreatmentPlan extends Document {
  tuc: string;
  treatmentName: string;
  clinic: mongoose.Types.ObjectId;
  description?: string;
  treatmentImages: string[];
  beforeAfterImages: string[];
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
  instructions?: string;
  disclaimer?: string;
  inclusions?: string;
  exclusions?: string;
  gender: "Unisex" | "Male" | "Female";
  paymentOption: "Cash" | "UPI" | "Card" | "EMI" | "Net Banking";
  promoCode?: string;
  addToCart: boolean;
  isActive: boolean;
  rating?: number;
  reviews?: string;
  patientFeedback?: string;
}

const TreatmentPlanSchema = new Schema<ITreatmentPlan>(
  {
    tuc: { type: String, required: true, unique: true },
    treatmentName: { type: String, required: true, trim: true },
    clinic: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    description: { type: String, default: "" },

    treatmentImages: { type: [String], default: [] },
    beforeAfterImages: { type: [String], default: [] },
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

    instructions: { type: String, default: "" },
    disclaimer: { type: String, default: "" },
    inclusions: { type: String, default: "" },
    exclusions: { type: String, default: "" },

    gender: {
      type: String,
      enum: ["Unisex", "Male", "Female"],
      default: "Unisex",
    },
    paymentOption: {
      type: String,
      enum: ["Cash", "UPI", "Card", "EMI", "Net Banking"],
      default: "Cash",
    },
    promoCode: { type: String, default: "" },

    addToCart: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },

    rating: { type: Number, min: 0, max: 5 },
    reviews: { type: String, default: "" },
    patientFeedback: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.TreatmentPlan ||
  mongoose.model<ITreatmentPlan>("TreatmentPlan", TreatmentPlanSchema);
