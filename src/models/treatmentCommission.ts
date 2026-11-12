import mongoose, { Document, Schema } from "mongoose";

// Stores only the admin-entered side of a treatment booking's commission
// settlement row — everything else (booking id/date, customer, package,
// clinic, sale amount, order status) is derived live from the Order it
// belongs to, so there's one source of truth for that data. Keyed by
// (orderId, itemId) since one order can contain multiple treatment line
// items (e.g. the same treatment booked at different clinics).
export interface ITreatmentCommission extends Document {
  orderId: mongoose.Types.ObjectId;
  itemId: string;
  clinicId?: string;
  // Commission has no fixed rate anywhere in the system, so the clinic's
  // payable amount is entered manually by admin per booking rather than
  // auto-calculated from a percentage.
  clinicPayableAmount: number;
  adjustmentAmount: number;
  settlementStatus: "Pending" | "Settled";
  settlementDate?: Date;
  comments?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TreatmentCommissionSchema = new Schema<ITreatmentCommission>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    itemId: {
      type: String,
      required: true,
    },
    clinicId: {
      type: String,
    },
    clinicPayableAmount: {
      type: Number,
      default: 0,
    },
    adjustmentAmount: {
      type: Number,
      default: 0,
    },
    settlementStatus: {
      type: String,
      enum: ["Pending", "Settled"],
      default: "Pending",
    },
    settlementDate: {
      type: Date,
    },
    comments: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

TreatmentCommissionSchema.index({ orderId: 1, itemId: 1 }, { unique: true });

export default mongoose.models.TreatmentCommission ||
  mongoose.model<ITreatmentCommission>("TreatmentCommission", TreatmentCommissionSchema);
