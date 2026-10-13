import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICoupon extends Document {
  couponId: string;
  couponName: string;
  couponCode: string;
  discountType: "percent" | "amount";
  discountValue: number;
  startDate?: Date;
  expiryDate?: Date;
  isActive: boolean;
  usageLimit?: number;
  perCustomerLimit?: number;
  serviceSection: string;
  subService?: string;
  cartValue?: number;
  newUserOnly: boolean;
  maxDiscount?: number;
  // When true, this coupon is surfaced directly to every eligible user in
  // their cart/checkout (an advertised offer) instead of only working when
  // someone already knows the code and types it in.
  isPublic: boolean;
  timesUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    couponId: { type: String, required: true, unique: true },
    couponName: { type: String, required: true, trim: true },
    couponCode: { type: String, required: true, unique: true, uppercase: true, trim: true },

    discountType: { type: String, enum: ["percent", "amount"], required: true },
    discountValue: { type: Number, required: true, min: 0 },

    startDate: { type: Date },
    expiryDate: { type: Date },
    isActive: { type: Boolean, default: true },

    usageLimit: { type: Number, min: 0 },
    perCustomerLimit: { type: Number, min: 0 },

    serviceSection: { type: String, required: true, trim: true },
    subService: { type: String, trim: true, default: "" },

    cartValue: { type: Number, min: 0 },
    newUserOnly: { type: Boolean, default: false },
    maxDiscount: { type: Number, min: 0 },
    isPublic: { type: Boolean, default: false },

    // How many times this coupon has actually been redeemed so far —
    // incremented by the checkout flow, never set directly by the admin.
    timesUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Coupon: Model<ICoupon> =
  mongoose.models.Coupon || mongoose.model<ICoupon>("Coupon", CouponSchema);

export default Coupon;
