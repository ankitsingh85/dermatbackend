import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
  userId?: mongoose.Types.ObjectId;
  clinicId?: mongoose.Types.ObjectId;
  ownerType?: "user" | "clinic";
  orderType: "product" | "treatment";
  products: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    image?: string;
    itemType?: "product" | "treatment";
  }[];
  totalAmount: number;
  address: {
    type: string;
    address: string;
  };
  paymentStatus?: "pending" | "success" | "failed";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: false,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["user", "clinic"],
      default: "user",
    },
    orderType: {
      type: String,
      enum: ["product", "treatment"],
      default: "product",
      index: true,
    },
    products: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        image: { type: String },
        itemType: { type: String, enum: ["product", "treatment"], default: "product" },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    address: {
      type: {
        type: String,
        enum: ["Home", "Work", "Other", "Clinic"],
        required: true,
      },
      address: { type: String, required: true },
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "success",
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
  },
  { timestamps: true }
);

const Order = mongoose.model<IOrder>("Order", OrderSchema);
export default Order;
