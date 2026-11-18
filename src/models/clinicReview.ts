import mongoose, { Schema, Document } from "mongoose";

export interface IClinicReview extends Document {
  clinicId: string;
  name: string;
  rating: number;
  comment: string;
  reply?: string;
  repliedAt?: Date;
}
const clinicReviewSchema = new Schema<IClinicReview>(
  {
    clinicId: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      required: true,
    },

    reply: {
      type: String,
      default: "",
    },
    
    repliedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IClinicReview>(
  "ClinicReview",
  clinicReviewSchema
);
