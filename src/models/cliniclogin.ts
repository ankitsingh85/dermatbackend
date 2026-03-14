import mongoose, { Document, Schema } from "mongoose";

export interface IClinicLogin extends Document {
  clinicName: string;
  email: string;
  contactNo: string;
  address: string;
  ownerName?: string;
  whatsapp?: string;
}

const ClinicLoginSchema = new Schema<IClinicLogin>(
  {
    clinicName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    contactNo: { type: String, required: true, unique: true, trim: true },
    address: { type: String, required: true, trim: true },
    ownerName: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.ClinicLogin ||
  mongoose.model<IClinicLogin>("ClinicLogin", ClinicLoginSchema);
