import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOffer3 extends Document {
  imageUrl: string;
  imageBase64?: string;
  clinicId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const Offer3Schema = new Schema<IOffer3>(
  {
    imageUrl: { type: String, required: true, trim: true },
    imageBase64: { type: String, trim: true, select: false },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ClinicCategory",
    },
  },
  { timestamps: true }
);

export default mongoose.model<IOffer3>("Offer3", Offer3Schema);
