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
  },
  { timestamps: true }
);

export default mongoose.model("Chat", chatSchema);
