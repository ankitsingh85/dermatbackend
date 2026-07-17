import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },
    senderId: String,
    receiverId: String,
    message: String,
    messageType: {
      type: String,
      enum: ["text", "call"],
      default: "text",
    },
    callType: {
      type: String,
      enum: ["audio", "video"],
    },
    callStatus: {
      type: String,
      enum: ["started", "missed", "ended"],
    },
    attachmentUrl: { type: String },
    attachmentType: {
      type: String,
      enum: ["image", "pdf"],
    },
    attachmentName: { type: String },
    seen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
