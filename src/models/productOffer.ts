import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOffer1 extends Document {
  imageBase64: string;
  productId?: Types.ObjectId;
  categoryId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer1Schema = new Schema<IOffer1>(
  {
    imageBase64: { type: String, required: true },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
    categoryId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IOffer1>("Offer1", Offer1Schema);
