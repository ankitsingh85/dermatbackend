import mongoose, { Schema, Document, Model } from "mongoose";

// Optional extra paid services a clinic can attach on top of the base
// subscription plan at purchase/renewal time (e.g. "Priority Placement",
// "Extra WhatsApp Number"). Admin manages the catalog; price is a flat
// amount charged once per billing cycle, same cadence as the base plan.
export interface IClinicSubscriptionAddon extends Document {
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClinicSubscriptionAddonSchema = new Schema<IClinicSubscriptionAddon>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const ClinicSubscriptionAddon: Model<IClinicSubscriptionAddon> =
  mongoose.models.ClinicSubscriptionAddon ||
  mongoose.model<IClinicSubscriptionAddon>("ClinicSubscriptionAddon", ClinicSubscriptionAddonSchema);

export default ClinicSubscriptionAddon;
