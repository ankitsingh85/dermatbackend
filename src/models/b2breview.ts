import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
  productId: string;

  name: string;

  rating: number;

  comment: string;
}

const reviewSchema = new Schema<IReview>(
  {
    productId: {
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

export default mongoose.model<IReview>("Review", reviewSchema);
