import mongoose, { Schema, Document } from "mongoose";

export interface IOffer2 extends Document {
  imageBase64: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer2Schema = new Schema<IOffer2>(
  {
    imageBase64: { type: String, required: true }, // Store image as Base64 string
  },
  { timestamps: true }
);

export default mongoose.model<IOffer2>("Offer2", Offer2Schema);
