import mongoose, { HydratedDocument, model, models, Schema } from "mongoose";

// Only trainingName, instituteName and netFeesInr are mandatory —
// everything else is optional at creation time.
export interface IWorkshopTraining {
  _id?: string;
  trainingName: string;
  trainingUniqueCode: string;
  trainingType: string[];
  hsnCode?: string;
  discountPercent: number;
  instituteName: string;
  trainingDuration?: string;
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
  installmentEmiOption: boolean;
  location?: string;
  maximumSeatsBatchSize?: number;
  currentAvailability?: string;
  trainerInstructorName?: string;
  trainingImage?: string;
  trainerImage?: string;
  trainerExperience?: string;
  languageOfDelivery?: string;
  whatsIncluded?: string;
  whatsNotIncluded?: string;
  learningOutcomes?: string;
  courseDemoVideo?: string;
  brochurePdfDownload: string[];
  refundCancellationPolicy?: string;
  postTrainingSupport?: string;
  contactForQueries?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WorkshopTrainingDocument = HydratedDocument<IWorkshopTraining>;

const WorkshopTrainingSchema = new Schema<WorkshopTrainingDocument>(
  {
    trainingName: {
      type: String,
      required: true,
      trim: true,
    },
    trainingUniqueCode: { type: String, required: true, trim: true, unique: true },
    trainingType: { type: [String], default: [] },
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
    instituteName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Institute name should contain only letters and spaces",
      },
    },
    trainingDuration: { type: String, trim: true },
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
    installmentEmiOption: { type: Boolean, default: false },
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
    trainingImage: { type: String, trim: true },
    trainerImage: { type: String, trim: true },
    trainerExperience: { type: String, trim: true },
    languageOfDelivery: {
      type: String,
      enum: ["English", "Hindi", "Bilingual"],
    },
    whatsIncluded: { type: String, trim: true },
    whatsNotIncluded: { type: String, trim: true },
    learningOutcomes: { type: String, trim: true },
    courseDemoVideo: {
      type: String,
      default: "",
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
    postTrainingSupport: { type: String, trim: true },
    contactForQueries: { type: String, trim: true },
  },
  { timestamps: true }
);

const WorkshopTrainingModel =
  (models.WorkshopTraining as mongoose.Model<WorkshopTrainingDocument>) ||
  model<WorkshopTrainingDocument>("WorkshopTraining", WorkshopTrainingSchema);

export default WorkshopTrainingModel;