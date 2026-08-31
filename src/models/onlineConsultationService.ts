import mongoose, { Document, Schema } from "mongoose";

export interface IOnlineConsultationService extends Document {
  serviceCode: string;
  serviceType: string;
  doctors: mongoose.Types.ObjectId[];
  imageUrl: string;
  consultationFee: number;
  offerPrice?: number;
  discountPercent: number;
  isActive: boolean;
  // Daily recurring "Connect with Doctor" window, in IST, 24hr "HH:mm".
  // Undefined/empty on either end means no restriction (available all day).
  availabilityStartTime?: string;
  availabilityEndTime?: string;
}

const OnlineConsultationServiceSchema: Schema = new Schema<IOnlineConsultationService>(
  {
    // Auto-generated on create — format OnCon-<YYYYMM>-<N>, never trusted
    // from the client. See generateNextOnlineConsultationCode() in the route.
    serviceCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    serviceType: {
      type: String,
      required: [true, "Service type is required"],
      trim: true,
    },
    doctors: [
      {
        type: Schema.Types.ObjectId,
        ref: "Doctor",
      },
    ],
    imageUrl: {
      type: String,
      required: [true, "Service image is required"],
    },
    consultationFee: {
      type: Number,
      required: [true, "Consultation fee is required"],
      min: 0,
    },
    offerPrice: {
      type: Number,
      min: 0,
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    availabilityStartTime: {
      type: String,
      trim: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24hr HH:mm format"],
    },
    availabilityEndTime: {
      type: String,
      trim: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24hr HH:mm format"],
    },
  },
  { timestamps: true }
);

export default mongoose.model<IOnlineConsultationService>(
  "OnlineConsultationService",
  OnlineConsultationServiceSchema
);
