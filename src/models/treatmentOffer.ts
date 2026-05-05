import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOffer2 extends Document {
  imageUrl: string;
  imageBase64?: string;
  categoryId?: Types.ObjectId;
  treatmentId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer2Schema = new Schema<IOffer2>(
  {
    imageUrl: { type: String, required: true, trim: true },
    imageBase64: { type: String, trim: true, select: false },
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
