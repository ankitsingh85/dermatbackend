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
  trainerExperience: string;
  languageOfDelivery: string;
  whatsIncluded: string;
  whatsNotIncluded: string;
  learningOutcomes: string;
  courseDemoVideo?: string;
  brochurePdfDownload: string[];
  refundCancellationPolicy: string;
  postCourseSupport: string;
  contactForQueries: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CourseDocument = HydratedDocument<ICourse>;

const CourseSchema = new Schema<CourseDocument>(
  {
    courseName: { type: String, required: true, trim: true },
    courseUniqueCode: { type: String, required: true, trim: true, unique: true },
    courseType: { type: String, default: "" },
    instituteName: { type: String, default: "" },
    courseDuration: { type: String, default: "" },
    modeOfTraining: { type: String, default: "" },
    startDate: { type: Date },
    endDate: { type: Date },
    registrationDeadline: { type: Date },
    curriculumTopicsCovered: { type: String, default: "" },
    targetAudience: { type: [String], default: [] },
    certificationProvided: {
      type: String,
      enum: ["", "Yes", "No"],
      default: "",
    },
    affiliationAccreditation: { type: String, default: "" },
    feesInr: { type: Number, default: 0 },
    applyDiscountVoucher: { type: Boolean, default: false },
    netFeesInr: { type: Number, default: 0 },
    discountsOffers: { type: String, default: "" },
    location: { type: String, default: "" },
    maximumSeatsBatchSize: { type: Number },
    currentAvailability: { type: String, default: "" },
    trainerInstructorName: { type: String, default: "" },
    trainerExperience: { type: String, default: "" },
    languageOfDelivery: {
      type: String,
      enum: ["", "English", "Hindi", "Bilingual"],
      default: "",
    },
    whatsIncluded: { type: String, default: "" },
    whatsNotIncluded: { type: String, default: "" },
    learningOutcomes: { type: String, default: "" },
    courseDemoVideo: { type: String, default: "" },
    brochurePdfDownload: { type: [String], default: [] },
    refundCancellationPolicy: { type: String, default: "" },
    postCourseSupport: { type: String, default: "" },
    contactForQueries: { type: String, default: "" },
  },
  { timestamps: true }
);

const CourseModel =
  (models.Course as mongoose.Model<CourseDocument>) ||
  model<CourseDocument>("Course", CourseSchema);

export default CourseModel;
