import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOffer2 extends Document {
  imageBase64: string;
  categoryId?: Types.ObjectId;
  treatmentId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer2Schema = new Schema<IOffer2>(
  {
    imageBase64: { type: String, required: true }, // Store image as Base64 string
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ServiceCategory",
    },
    treatmentId: {
      type: Schema.Types.ObjectId,
      ref: "TreatmentPlan",
    },
  },
  { timestamps: true }
);

export default mongoose.model<IOffer2>("Offer2", Offer2Schema);
