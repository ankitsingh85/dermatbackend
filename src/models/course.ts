import mongoose, { HydratedDocument, model, models, Schema } from "mongoose";

// Only courseName, instituteName and netFeesInr are mandatory — everything
// else is optional at creation time.
export interface ICourse {
  _id?: string;
  courseName: string;
  courseUniqueCode: string;
  courseType: string[];
  instituteName: string;
  courseDuration?: string;
  modeOfTraining?: string;
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  curriculumTopicsCovered?: string;
  targetAudience: string[];
  certificationProvided?: string;
  affiliationAccreditation?: string;
  feesInr?: number;
  applyDiscountVoucher: boolean;
  netFeesInr: number;
  discountsOffers: string;
  location?: string;

  hsnCode?: string;
  discountPercent: number;
  maximumSeatsBatchSize?: number;
  currentAvailability?: string;
  trainerInstructorName?: string;
  trainerImage?: string;
  trainerExperience?: string;
  languageOfDelivery?: string;
  whatsIncluded?: string;
  whatsNotIncluded?: string;
  learningOutcomes?: string;
  courseImage?: string;
  courseDemoVideo?: string;
  brochurePdfDownload: string[];
  refundCancellationPolicy?: string;
  postCourseSupport?: string;
  mobileNo?: string;
  contactForQueries?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CourseDocument = HydratedDocument<ICourse>;

const CourseSchema = new Schema<CourseDocument>(
  {
    courseName: {
      type: String,
      required: true,
      trim: true,
    },

    hsnCode: {
      type: String,
      trim: true,
    },

    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    courseUniqueCode: {
      type: String,
      unique: true,
      trim: true,
    },
    courseType: { type: [String], default: [] },
    courseDuration: { type: String, trim: true },
    modeOfTraining: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    registrationDeadline: { type: Date },
    curriculumTopicsCovered: { type: String, trim: true },
    targetAudience: { type: [String], default: [] },
    certificationProvided: {
      type: String,
      enum: ["Yes", "No"],
    },
    affiliationAccreditation: { type: String, trim: true },
    feesInr: {
      type: Number,
      min: 0,
      validate: {
        validator: (value: number) => value === undefined || Number.isInteger(value),
        message: "Fees (INR) must contain digits only",
      },
    },
    applyDiscountVoucher: { type: Boolean, default: false },
    netFeesInr: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "Net fees (INR) must contain digits only",
      },
    },
    discountsOffers: { type: String, default: "" },
    location: { type: String, trim: true },
    maximumSeatsBatchSize: {
      type: Number,
      min: 1,
      validate: {
        validator: (value: number) => value === undefined || Number.isInteger(value),
        message: "Maximum seats / batch size must contain digits only",
      },
    },
    currentAvailability: { type: String, trim: true },
    trainerInstructorName: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^[A-Za-z ]+$/.test(value),
        message: "Trainer / instructor name should contain only letters and spaces",
      },
    },
    trainerImage: { type: String, trim: true },
    trainerExperience: { type: String, trim: true },
    languageOfDelivery: {
      type: String,
      enum: ["English", "Hindi", "Bilingual"],
    },
    whatsIncluded: { type: String, trim: true },
    whatsNotIncluded: { type: String, trim: true },
    learningOutcomes: { type: String, trim: true },
    courseImage: { type: String, trim: true },
    courseDemoVideo: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => {
          if (!value) return true;
          try {
            const url = new URL(value);
            const host = url.hostname.toLowerCase();
            return host.includes("youtube.com") || host.includes("youtu.be");
          } catch {
            return false;
          }
        },
        message: "Course demo video must be a valid YouTube link",
      },
    },
    brochurePdfDownload: { type: [String], default: [] },
    refundCancellationPolicy: { type: String, trim: true },
    postCourseSupport: { type: String, trim: true },
    mobileNo: {
      type: String,
      trim: true,
      validate: {
        validator: (value: string) => !value || /^\d{10}$/.test(value),
        message: "Mobile number must be exactly 10 digits",
      },
    },
    contactForQueries: { type: String, trim: true },
  },
  { timestamps: true }
);

const CourseModel =
  (models.Course as mongoose.Model<CourseDocument>) ||
  model<CourseDocument>("Course", CourseSchema);

export default CourseModel;