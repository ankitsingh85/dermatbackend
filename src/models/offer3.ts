import mongoose, { Schema, Document } from "mongoose";

export interface IOffer3 extends Document {
  imageBase64: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer3Schema = new Schema<IOffer3>(
  {
    imageBase64: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IOffer3>("Offer3", Offer3Schema);
