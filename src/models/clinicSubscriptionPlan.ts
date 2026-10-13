import mongoose, { Schema, Document, Model } from "mongoose";

// Single, shared plan definition — there is only ever one document here.
// Admin edits its prices/features; clinics buy a billing cycle against it.
export interface IClinicSubscriptionPlan extends Document {
  planName: string;
  description: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  yearlyPrice: number;
  isActive: boolean;
  features: string[];
}

const DEFAULT_FEATURES = [
  "Unlimited Leads",
  "Verified Badge",
  "WhatsApp Lead Notification",
  "CRM / Lead Dashboard",
  "Lead Export",
  "Patient Leads Included",
  "Clinic Profile",
];

const ClinicSubscriptionPlanSchema = new Schema<IClinicSubscriptionPlan>(
  {
    planName: { type: String, required: true, trim: true, default: "Clinic Growth Plan" },
    description: { type: String, trim: true, default: "" },
    monthlyPrice: { type: Number, required: true, min: 0, default: 999 },
    quarterlyPrice: { type: Number, required: true, min: 0, default: 2499 },
    yearlyPrice: { type: Number, required: true, min: 0, default: 8999 },
    isActive: { type: Boolean, default: true },
    features: { type: [String], default: () => [...DEFAULT_FEATURES] },
  },
  { timestamps: true }
);

const ClinicSubscriptionPlan: Model<IClinicSubscriptionPlan> =
  mongoose.models.ClinicSubscriptionPlan ||
  mongoose.model<IClinicSubscriptionPlan>("ClinicSubscriptionPlan", ClinicSubscriptionPlanSchema);

export default ClinicSubscriptionPlan;
