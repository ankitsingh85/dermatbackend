import mongoose, { Schema, Document } from "mongoose";

export interface IOffer1 extends Document {
  imageBase64: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer1Schema = new Schema<IOffer1>(
  {
    imageBase64: { type: String, required: true }, // Store image as Base64 string
  },
  { timestamps: true }
);

export default mongoose.model<IOffer1>("Offer1", Offer1Schema);
