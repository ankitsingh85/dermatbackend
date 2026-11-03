import mongoose, { Schema, Document } from "mongoose";

export interface IClinicReview extends Document {
  clinicId: string;
  // The logged-in user who wrote it — one review per user per clinic.
  // Older reviews (before login was required) don't have it.
  userId?: string;
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

    userId: {
      type: String,
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

// Database-level guard: a user can have only one review per clinic. Partial
// so older reviews saved without a userId don't collide with each other.
clinicReviewSchema.index(
  { clinicId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "string" } } }
);

export default mongoose.model<IClinicReview>(
  "ClinicReview",
  clinicReviewSchema
);
