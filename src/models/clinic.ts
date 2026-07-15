import mongoose, { Schema, Document } from "mongoose";
import type { ClinicAddress } from "../utils/clinicAddresses";

interface IDoctor {
  name: string;
  regNo: string;
  specialization: string;
}

export interface IClinicWorkingHours {
  openTime: string; // e.g. "09:00"
  closeTime: string; // e.g. "18:00"
  days: string[]; // working days, e.g. ["Monday", "Tuesday", ...]
  offDays: string[]; // clinic-off days, e.g. ["Sunday"]
}

export interface IClinic extends Document {
  cuc: string;
  clinicName: string;
  slug?: string;
  clinicType?: string;
  ownerName?: string;
  website?: string;
  dermaCategory: mongoose.Types.ObjectId;
  clinicLogo?: string;
  bannerImage?: string;
  specialOffers?: string[];
  rateCard?: string[];
  photos?: string[];
  video?: string;
  certifications?: string[];
  doctors: IDoctor[];
  address?: string;
  addresses?: ClinicAddress[];
  city?: string;
  services?: string;
  sector?: string;
  pincode?: string;
  mapLink?: string;
  contactNumber: string;
  whatsapp?: string;
  email?: string;
  workingHours?: IClinicWorkingHours;
  licenseNo?: string;
  experience?: string;
  treatmentsAvailable?: string;
  availableServices?: string;
  consultationFee?: string;
  bookingMode?: string;
  clinicDescription?: string;
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  standardPlanLink?: string;
  clinicStatus?: string;
  verifiedBadge?: boolean;
  isActive?: boolean;
    latitude?: number;
  longitude?: number;

  // Admin approval gate for self-registered clinics. New signups start
  // "pending" and can't log in until an admin approves them; rejected
  // clinics are told why (rejectionReason) and can't log in either.
  approvalStatus?: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  approvedAt?: Date;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    name: { type: String, required: true },
    regNo: { type: String, required: true },
    specialization: { type: String, required: true },
  },
  { _id: false }
);

const ClinicAddressSchema = new Schema<ClinicAddress>(
  {
    type: { type: String, default: "Clinic" },
    address: { type: String, default: "" },
    fullName: { type: String, default: "" },
    mobileNo: { type: String, default: "" },
    houseNo: { type: String, default: "" },
    street: { type: String, default: "" },
    localArea: { type: String, default: "" },
    pincode: { type: String, default: "" },
    district: { type: String, default: "" },
    state: { type: String, default: "" },
  },
  { _id: false }
);

const ClinicWorkingHoursSchema = new Schema<IClinicWorkingHours>(
  {
    openTime: { type: String, default: "" },
    closeTime: { type: String, default: "" },
    days: { type: [String], default: [] },
    offDays: { type: [String], default: [] },
  },
  { _id: false }
);

const ClinicSchema = new Schema<IClinic>(
  {
    cuc: { type: String, required: true, unique: true },

    clinicName: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true, trim: true },
    clinicType: String,
    ownerName: String,
    website: String,

    dermaCategory: {
      type: Schema.Types.ObjectId,
      ref: "ClinicCategory",
      required: true,
    },

     latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    clinicLogo: String,
    bannerImage: String,
    specialOffers: [String],
    rateCard: [String],
    photos: [String],
    video: String,
    certifications: [String],

    doctors: [DoctorSchema],

    address: { type: String },
    addresses: { type: [ClinicAddressSchema], default: [] },
    city: String,
    services: String,
    sector: String,
    pincode: String,
    mapLink: String,

    // contactNumber and whatsapp are required by the admin "Create Clinic"
    // form/route, but not enforced here at the schema level — clinic
    // self-registration (ClinicAuthController) treats WhatsApp as
    // optional, and both flows share this model.
    contactNumber: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    email: { type: String },

    workingHours: { type: ClinicWorkingHoursSchema, default: () => ({}) },

    licenseNo: String,
    experience: String,

    treatmentsAvailable: String,
    availableServices: String,

    consultationFee: String,
    bookingMode: String,

    clinicDescription: String,

    instagram: String,
    linkedin: String,
    facebook: String,

    standardPlanLink: String,

    clinicStatus: { type: String, default: "Open" },
    verifiedBadge: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.Clinic ||
  mongoose.model<IClinic>("Clinic", ClinicSchema);