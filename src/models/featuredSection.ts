import mongoose, { Document, Schema } from "mongoose";

export interface IFeaturedSection extends Document {
  imageUrl: string;
  heading: string;
  link: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const FeaturedSectionSchema = new Schema<IFeaturedSection>(
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

export default mongoose.models.FeaturedSection ||
  mongoose.model<IFeaturedSection>("FeaturedSection", FeaturedSectionSchema);
