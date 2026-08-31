import mongoose, { Document, Schema, Types } from "mongoose";

export type HiringRequesterType = "clinic" | "doctor" | "b2buser";
export type HiringRequestStatus = "pending" | "in_review" | "fulfilled" | "cancelled";

export interface IHiringDetails {
  roleRequired: string;
  jobType?: string;
  teamMembersRequired: number;
  experienceRequired?: string;
  location: string;
  salaryRange?: string;
  requiredSkills?: string;
  additionalInfo?: string;
}

export interface IHiringRequest extends Document {
  requestNumber: string;
  requesterType: HiringRequesterType;
  requesterId: Types.ObjectId;
  requesterName: string;
  requesterEmail?: string;
  requesterPhone?: string;
  status: HiringRequestStatus;
  hiringDetails: IHiringDetails;
  createdAt?: Date;
  updatedAt?: Date;
}

const HiringDetailsSchema = new Schema<IHiringDetails>(
  {
    roleRequired: { type: String, trim: true, required: true },
    jobType: { type: String, trim: true, default: "" },
    teamMembersRequired: { type: Number, default: 1 },
    experienceRequired: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, required: true },
    salaryRange: { type: String, trim: true, default: "" },
    requiredSkills: { type: String, trim: true, default: "" },
    additionalInfo: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const HiringRequestSchema = new Schema<IHiringRequest>(
  {
    requestNumber: { type: String, required: true, unique: true, trim: true },
    requesterType: {
      type: String,
      enum: ["clinic", "doctor", "b2buser"],
      required: true,
    },
    requesterId: { type: Schema.Types.ObjectId, required: true, index: true },
    requesterName: { type: String, trim: true, required: true },
    requesterEmail: { type: String, trim: true, default: "" },
    requesterPhone: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "in_review", "fulfilled", "cancelled"],
      default: "pending",
      index: true,
    },
    hiringDetails: { type: HiringDetailsSchema, required: true },
  },
  { timestamps: true }
);

HiringRequestSchema.index({ requesterType: 1, requesterId: 1, createdAt: -1 });

export default (mongoose.models.HiringRequest as mongoose.Model<IHiringRequest>) ||
  mongoose.model<IHiringRequest>("HiringRequest", HiringRequestSchema);
