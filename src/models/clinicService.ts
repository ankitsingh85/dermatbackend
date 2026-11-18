import mongoose, { Document, Schema } from "mongoose";

export interface IClinicService extends Document {
  name: string;
  imageUrl: string;
  description: string;
}

const ClinicServiceSchema: Schema = new Schema<IClinicService>(
  {
    name: {
      type: String,
      required: [true, "Clinic service name is required"],
      trim: true,
    },
    imageUrl: {
      type: String,
      required: [true, "Clinic service image is required"],
    },
    description: {
      type: String,
      required: [true, "Clinic service description is required"],
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IClinicService>(
  "ClinicService",
  ClinicServiceSchema
);
