import mongoose, { Schema, Document } from "mongoose";

export interface IOffer4 extends Document {
  imageBase64: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer4Schema = new Schema<IOffer4>(
  {
    imageBase64: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IOffer4>("Offer4", Offer4Schema);
