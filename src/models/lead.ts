import mongoose, { Document, Schema, Types } from "mongoose";

export type LeadActionType = "call" | "whatsapp";

export interface ILead extends Document {
  clinicId: Types.ObjectId;
  userId: Types.ObjectId;
  actionType: LeadActionType;
  clinicName?: string;
  clinicSlug?: string;
  userName?: string;
  userEmail?: string;
  userContactNo?: string;
  userPatientId?: string;
  userProfileImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: ["call", "whatsapp"],
      required: true,
    },
    clinicName: { type: String, default: "" },
    clinicSlug: { type: String, default: "" },
    userName: { type: String, default: "" },
    userEmail: { type: String, default: "" },
    userContactNo: { type: String, default: "" },
    userPatientId: { type: String, default: "" },
    userProfileImage: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

LeadSchema.index({ clinicId: 1, createdAt: -1 });

export default mongoose.models.Lead ||
  mongoose.model<ILead>("Lead", LeadSchema);
