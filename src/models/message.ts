import mongoose from "mongoose";

const recommendationItemSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ["product", "treatment"],
      required: true,
    },
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    image: String,
    price: { type: Number, default: 0 },
    mrp: Number,
  },
  { _id: false }
);

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
      enum: ["text", "call", "recommendation"],
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
    // Doctor-suggested products/treatments, shown to the patient as
    // "Add to Cart" cards within the chat (messageType: "recommendation").
    recommendations: {
      type: [recommendationItemSchema],
      default: undefined,
    },
    seen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
