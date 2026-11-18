import mongoose, { Document, Schema } from "mongoose";

export interface IB2BFeaturedSection extends Document {
  imageUrl: string;
  heading: string;
  link: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const B2BFeaturedSectionSchema = new Schema<IB2BFeaturedSection>(
  {
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    heading: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      trim: true,
      default: "/#",
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export default mongoose.models.B2BFeaturedSection ||
  mongoose.model<IB2BFeaturedSection>("B2BFeaturedSection", B2BFeaturedSectionSchema);
