import mongoose, { Schema, Document } from "mongoose";

export interface IClinicCategory extends Document {
  categoryId: string;
  name: string;
  imageUrl: string; // uploaded file path or legacy string
}

const ClinicCategorySchema: Schema = new Schema(
  {
    categoryId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IClinicCategory>(
  "ClinicCategory",
  ClinicCategorySchema
);
