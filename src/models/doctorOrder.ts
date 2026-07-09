import mongoose, { Document, Schema } from "mongoose";

export interface IDoctorOrder extends Document {
  doctorId: mongoose.Types.ObjectId;
  ownerType: "doctor";
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
  status?: "Pending" | "Shipped" | "Delivered" | "Cancelled";
  createdAt?: Date;
  updatedAt?: Date;
}

const DoctorOrderSchema = new Schema<IDoctorOrder>(
  {
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["doctor"],
      default: "doctor",
      required: true,
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
        enum: ["Home", "Work", "Other", "Doctor"],
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
    status: {
      type: String,
      enum: ["Pending", "Shipped", "Delivered", "Cancelled"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

const DoctorOrder = mongoose.model<IDoctorOrder>("DoctorOrder", DoctorOrderSchema);
export default DoctorOrder;
