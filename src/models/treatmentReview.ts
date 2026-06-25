import mongoose, { Schema, Document } from "mongoose";

export interface ITreatmentReview extends Document {
  treatmentId: string;

  name: string;

  rating: number;

  comment: string;
}

const treatmentReviewSchema = new Schema<ITreatmentReview>(
  {
    treatmentId: {
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
  },

  {
    timestamps: true,
  },
);

export default mongoose.model<ITreatmentReview>(
  "TreatmentReview",
  treatmentReviewSchema,
);
