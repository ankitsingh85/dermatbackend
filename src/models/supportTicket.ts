import mongoose, { Document, Schema, Types } from "mongoose";

export type TicketRequesterType = "clinic" | "doctor" | "b2buser";
export type TicketStatus = "open" | "answered" | "closed";
export type TicketPriority = "low" | "medium" | "high";
export type TicketMessageSender = "requester" | "admin";

export interface ITicketAttachment {
  url: string;
  name: string;
}

export interface ITicketMessage {
  senderType: TicketMessageSender;
  senderName?: string;
  message: string;
  attachments: ITicketAttachment[];
  createdAt?: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  requesterType: TicketRequesterType;
  requesterId: Types.ObjectId;
  requesterName: string;
  requesterEmail?: string;
  requesterPhone?: string;
  department: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  // Set once when a hiring wizard submission creates this ticket — keeps
  // the structured request data around even though the conversation itself
  // lives in `messages`.
  hiringDetails?: Record<string, unknown>;
  // Set when this ticket was raised as a query against a HiringRequest,
  // linking the conversation back to that request.
  hiringRequestId?: Types.ObjectId;
  messages: ITicketMessage[];
  createdAt?: Date;
  updatedAt?: Date;
}

const TicketAttachmentSchema = new Schema<ITicketAttachment>(
  {
    url: { type: String, required: true },
    name: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const TicketMessageSchema = new Schema<ITicketMessage>(
  {
    senderType: {
      type: String,
      enum: ["requester", "admin"],
      required: true,
    },
    senderName: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
    attachments: { type: [TicketAttachmentSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, trim: true },
    requesterType: {
      type: String,
      enum: ["clinic", "doctor", "b2buser"],
      required: true,
    },
    requesterId: { type: Schema.Types.ObjectId, required: true, index: true },
    requesterName: { type: String, trim: true, required: true },
    requesterEmail: { type: String, trim: true, default: "" },
    requesterPhone: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "Hiring" },
    subject: { type: String, trim: true, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "answered", "closed"],
      default: "open",
      index: true,
    },
    hiringDetails: { type: Schema.Types.Mixed },
    hiringRequestId: { type: Schema.Types.ObjectId, ref: "HiringRequest", index: true },
    messages: { type: [TicketMessageSchema], default: [] },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ requesterType: 1, requesterId: 1, createdAt: -1 });

export default (mongoose.models.SupportTicket as mongoose.Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);
