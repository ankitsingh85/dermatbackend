import mongoose, { Document, Schema } from "mongoose";

export interface IOrder extends Document {
  userId?: mongoose.Types.ObjectId;
  clinicId?: mongoose.Types.ObjectId;
  b2bUserId?: mongoose.Types.ObjectId;
  ownerType?: "user" | "clinic" | "b2buser";
  orderType: "product" | "treatment" | "consultation";
  products: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    image?: string;
    itemType?: "product" | "treatment" | "consultation";
    // Only meaningful for treatment items — the clinic the user picked
    // (via the clinic-selection modal at checkout) to visit for that
    // treatment. Denormalized at order time, same as the rest of the
    // product line, so the order stays an accurate record even if the
    // clinic's details change later.
    clinicId?: string;
    clinicName?: string;
    clinicAddress?: string;
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
    b2bUserId: {
      type: Schema.Types.ObjectId,
      ref: "B2BUser",
      required: false,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ["user", "clinic", "b2buser"],
      default: "user",
    },
    orderType: {
      type: String,
      enum: ["product", "treatment", "consultation"],
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
        itemType: {
          type: String,
          enum: ["product", "treatment", "consultation"],
          default: "product",
        },
        clinicId: { type: String },
        clinicName: { type: String },
        clinicAddress: { type: String },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    address: {
      type: {
        type: String,
        enum: ["Home", "Work", "Other", "Clinic", "Doctor", "Business"],
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
