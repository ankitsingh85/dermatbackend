import mongoose, { Document, Schema, Types } from "mongoose";

export type HiringRequestStatus =
  | "pending"
  | "in_review"
  | "accepted"
  | "rejected"
  | "fulfilled";

export type HiringMessageSender = "clinic" | "admin";

export interface IHiringMessage {
  senderType: HiringMessageSender;
  senderName?: string;
  message: string;
  isRead: boolean;
  createdAt?: Date;
}

export interface IClinicHiringRequest extends Document {
  clinicId: Types.ObjectId;
  clinicName: string;
  clinicEmail?: string;
  clinicPhone?: string;
  roleRequired: string;
  teamMembersRequired: number;
  experienceRequired?: string;
  location: string;
  jobType: string;
  salaryRange?: string;
  commissionEnabled: boolean;
  commissionDetails?: string;
  requiredSkills?: string;
  additionalInfo?: string;
  status: HiringRequestStatus;
  messages: IHiringMessage[];
  createdAt?: Date;
  updatedAt?: Date;
}

const HiringMessageSchema = new Schema<IHiringMessage>(
  {
    senderType: {
      type: String,
      enum: ["clinic", "admin"],
      required: true,
    },
    senderName: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const ClinicHiringRequestSchema = new Schema<IClinicHiringRequest>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
      index: true,
    },
    clinicName: { type: String, trim: true, required: true },
    clinicEmail: { type: String, trim: true, default: "" },
    clinicPhone: { type: String, trim: true, default: "" },
    roleRequired: { type: String, trim: true, required: true },
    teamMembersRequired: { type: Number, min: 1, required: true },
    experienceRequired: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, required: true },
    jobType: {
      type: String,
      enum: ["Full time", "Part time", "Contract", "Freelance", "Visiting"],
      default: "Full time",
    },
    salaryRange: { type: String, trim: true, default: "" },
    commissionEnabled: { type: Boolean, default: false },
    commissionDetails: { type: String, trim: true, default: "" },
    requiredSkills: { type: String, trim: true, default: "" },
    additionalInfo: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "in_review", "accepted", "rejected", "fulfilled"],
      default: "pending",
      index: true,
    },
    messages: { type: [HiringMessageSchema], default: [] },
  },
  { timestamps: true }
);

ClinicHiringRequestSchema.index({ clinicId: 1, createdAt: -1 });

export default mongoose.models.ClinicHiringRequest ||
  mongoose.model<IClinicHiringRequest>(
    "ClinicHiringRequest",
    ClinicHiringRequestSchema
  );
