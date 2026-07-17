import mongoose, { Document, Schema } from "mongoose";

export interface IOnlineConsultationService extends Document {
  serviceCode: string;
  serviceType: string;
  doctors: mongoose.Types.ObjectId[];
  imageUrl: string;
  consultationFee: number;
  offerPrice?: number;
  discountPercent: number;
  timingSlots: string[];
  bookedSlots: string[];
  nextAvailableSlot: string;
  isActive: boolean;
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
    timingSlots: {
      type: [String],
      default: [],
    },
    bookedSlots: {
      type: [String],
      default: [],
    },
    // Derived server-side from timingSlots/bookedSlots — the first
    // timing slot that isn't already booked. Not directly editable.
    nextAvailableSlot: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IOnlineConsultationService>(
  "OnlineConsultationService",
  OnlineConsultationServiceSchema
);
