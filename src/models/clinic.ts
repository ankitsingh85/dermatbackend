import mongoose, { Schema, Document } from "mongoose";
import type { ClinicAddress } from "../utils/clinicAddresses";

interface IDoctor {
  name: string;
  regNo: string;
  specialization: string;
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
  address: string;
  addresses?: ClinicAddress[];
  city?: string;
  services?: string;
  sector?: string;
  pincode?: string;
  mapLink?: string;
  contactNumber?: string;
  whatsapp?: string;
  email: string;
  workingHours?: string;
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

    clinicLogo: String,
    bannerImage: String,
    specialOffers: [String],
    rateCard: [String],
    photos: [String],
    video: String,
    certifications: [String],

    doctors: [DoctorSchema],

    address: { type: String, required: true },
    addresses: { type: [ClinicAddressSchema], default: [] },
    city: String,
    services: String,
    sector: String,
    pincode: String,
    mapLink: String,

    contactNumber: { type: String, trim: true },
    whatsapp: String,
    email: { type: String, required: true },

    workingHours: String,

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
  },
  { timestamps: true }
);

export default mongoose.models.Clinic ||
  mongoose.model<IClinic>("Clinic", ClinicSchema);
