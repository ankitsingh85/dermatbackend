import mongoose, { HydratedDocument, model, models, Schema } from "mongoose";

export interface ICourse {
  _id?: string;
  courseName: string;
  courseUniqueCode: string;
  courseType: string;
  instituteName: string;
  courseDuration: string;
  modeOfTraining: string;
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  curriculumTopicsCovered: string;
  targetAudience: string[];
  certificationProvided: string;
  affiliationAccreditation: string;
  feesInr: number;
  applyDiscountVoucher: boolean;
  netFeesInr: number;
  discountsOffers: string;
  location: string;
  maximumSeatsBatchSize?: number;
  currentAvailability: string;
  trainerInstructorName: string;
  trainerImage?: string;
  trainerExperience: string;
  languageOfDelivery: string;
  whatsIncluded: string;
  whatsNotIncluded: string;
  learningOutcomes: string;
  courseImage?: string;
  courseDemoVideo?: string;
  brochurePdfDownload: string[];
  refundCancellationPolicy: string;
  postCourseSupport: string;
  mobileNo: string;
  contactForQueries: string;
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
    courseUniqueCode: { type: String, required: true, trim: true, unique: true },
    courseType: { type: String, required: true, trim: true },
    instituteName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Institute name should contain only letters and spaces",
      },
    },
    courseDuration: { type: String, required: true, trim: true },
    modeOfTraining: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    registrationDeadline: { type: Date, required: true },
    curriculumTopicsCovered: { type: String, required: true, trim: true },
    targetAudience: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one target audience item is required",
      },
    },
    certificationProvided: {
      type: String,
      enum: ["Yes", "No"],
      required: true,
    },
    affiliationAccreditation: { type: String, required: true, trim: true },
    feesInr: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
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
    location: { type: String, required: true, trim: true },
    maximumSeatsBatchSize: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "Maximum seats / batch size must contain digits only",
      },
    },
    currentAvailability: { type: String, required: true, trim: true },
    trainerInstructorName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Trainer / instructor name should contain only letters and spaces",
      },
    },
    trainerImage: { type: String, required: true, trim: true },
    trainerExperience: { type: String, required: true, trim: true },
    languageOfDelivery: {
      type: String,
      enum: ["English", "Hindi", "Bilingual"],
      required: true,
    },
    whatsIncluded: { type: String, required: true, trim: true },
    whatsNotIncluded: { type: String, required: true, trim: true },
    learningOutcomes: { type: String, required: true, trim: true },
    courseImage: { type: String, required: true, trim: true },
    courseDemoVideo: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => {
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
    brochurePdfDownload: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one brochure PDF is required",
      },
    },
    refundCancellationPolicy: { type: String, required: true, trim: true },
    postCourseSupport: { type: String, required: true, trim: true },
    mobileNo: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^\d{10}$/.test(value),
        message: "Mobile number must be exactly 10 digits",
      },
    },
    contactForQueries: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const CourseModel =
  (models.Course as mongoose.Model<CourseDocument>) ||
  model<CourseDocument>("Course", CourseSchema);

export default CourseModel;
