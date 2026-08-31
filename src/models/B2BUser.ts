import mongoose, { HydratedDocument, Schema, model, models } from "mongoose";

export interface IB2BUser {
  b2bUserId: string;
  name: string;
  contactPerson: string;
  email?: string;
  contactNo: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  status: "active" | "inactive";

  // Set while a "Become a Clinic" conversion is awaiting admin approval —
  // the B2BUser account stays fully usable in the meantime. Cleared on
  // rejection (so they can try again); on approval the B2BUser record is
  // deleted entirely (see clinicRoutes.ts's /approve route).
  pendingClinicId?: mongoose.Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type B2BUserDocument = HydratedDocument<IB2BUser>;

const B2BUserSchema = new Schema<B2BUserDocument>(
  {
    b2bUserId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    contactNo: { type: String, required: true, unique: true, trim: true },
    gstNumber: { type: String, uppercase: true, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    pendingClinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: false,
    },
  },
  { timestamps: true }
);

const B2BUserModel =
  (models.B2BUser as mongoose.Model<B2BUserDocument>) ||
  model<B2BUserDocument>("B2BUser", B2BUserSchema);

export default B2BUserModel;
