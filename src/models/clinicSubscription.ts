import mongoose, { Schema, Document, Model } from "mongoose";

export type BillingCycle = "monthly" | "quarterly" | "yearly";

export interface ISubscriptionAddonSnapshot {
  addonId: mongoose.Types.ObjectId;
  name: string;
  price: number;
}

export interface IClinicSubscription extends Document {
  clinicId: mongoose.Types.ObjectId;
  planName: string;
  billingCycle: BillingCycle;
  planAmount: number;
  addonsAmount: number;
  amount: number;
  addons: ISubscriptionAddonSnapshot[];
  startDate: Date;
  endDate: Date;
  status: "active" | "expired" | "cancelled";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionAddonSnapshotSchema = new Schema<ISubscriptionAddonSnapshot>(
  {
    addonId: { type: Schema.Types.ObjectId, ref: "ClinicSubscriptionAddon", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ClinicSubscriptionSchema = new Schema<IClinicSubscription>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    planName: { type: String, required: true, trim: true },
    billingCycle: { type: String, enum: ["monthly", "quarterly", "yearly"], required: true },
    // planAmount/addonsAmount are the breakdown; amount is the total charged
    // (kept for backward compatibility with records created before addons).
    planAmount: { type: Number, required: true, min: 0, default: 0 },
    addonsAmount: { type: Number, required: true, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    addons: { type: [SubscriptionAddonSnapshotSchema], default: [] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
    razorpayOrderId: { type: String, trim: true },
    razorpayPaymentId: { type: String, trim: true },
    razorpaySignature: { type: String, trim: true },
  },
  { timestamps: true }
);

ClinicSubscriptionSchema.index({ clinicId: 1, createdAt: -1 });

const ClinicSubscription: Model<IClinicSubscription> =
  mongoose.models.ClinicSubscription ||
  mongoose.model<IClinicSubscription>("ClinicSubscription", ClinicSubscriptionSchema);

export default ClinicSubscription;
