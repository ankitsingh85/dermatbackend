import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor", // ⚠️ must match your Doctor model name
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // ⚠️ must match your User model name
    },
    lastMessage: String,
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: Date,
    // Online-consultation chats only ("direct" doctor-picked chats never
    // expire or close). "consultation" chats auto-close 7 days after they
    // were created, or earlier if the doctor closes them manually — once
    // closed, the chat is read-only: no more messages, attachments,
    // prescriptions, or calls.
    source: {
      type: String,
      enum: ["direct", "consultation"],
      default: "direct",
    },
    consultationExpiresAt: Date,
    closedAt: Date,
    closedBy: {
      type: String,
      enum: ["doctor", "system"],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Chat", chatSchema);
