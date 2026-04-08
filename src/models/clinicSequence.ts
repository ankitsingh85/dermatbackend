import mongoose, { Schema, Document } from "mongoose";

export interface IClinicSequence extends Document {
  name: string;
  seq: number;
}

const ClinicSequenceSchema = new Schema<IClinicSequence>(
  {
    name: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.ClinicSequence ||
  mongoose.model<IClinicSequence>("ClinicSequence", ClinicSequenceSchema);
