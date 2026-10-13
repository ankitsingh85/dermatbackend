// src/models/admindoctor.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDoctor extends Document {
  title?: string;
  firstName: string;
  lastName: string;
  specialist: string;
  email: string;
  phone?: string;
  description?: string;
  address?: string;
  profileImage?: string;
  createdByAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema: Schema = new Schema(
  {
    title: { type: String },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    specialist: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, trim: true },
    description: { type: String, trim: true },
    address: { type: String, trim: true },
    profileImage: { type: String },
    createdByAdmin: { type: Boolean, default: true }, // ✅ add this
  },
  { timestamps: true }
);

// NOTE: the compiled Mongoose model is registered under the name "Doctor" —
// the same name src/models/doctor.ts registers. Whichever of the two files
// is imported first during server startup "wins" and its schema is what
// actually gets used everywhere (mongoose.models.Doctor short-circuits the
// other one); the IDoctor interface here is kept in sync with that shared
// schema so admindoctorRoutes.ts type-checks against the fields that are
// really being read/written.
const Doctor: Model<IDoctor> = mongoose.models.Doctor || mongoose.model<IDoctor>("Doctor", DoctorSchema);
export default Doctor;
