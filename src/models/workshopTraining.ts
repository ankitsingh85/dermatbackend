import mongoose, { HydratedDocument, model, models, Schema } from "mongoose";

export interface IWorkshopTraining {
  _id?: string;
  trainingName: string;
  trainingUniqueCode: string;
  trainingType: string;
  instituteName: string;
  trainingDuration: string;
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
  installmentEmiOption: boolean;
  location: string;
  maximumSeatsBatchSize: number;
  currentAvailability: string;
  trainerInstructorName: string;
  trainingImage: string;
  trainerExperience: string;
  languageOfDelivery: string;
  whatsIncluded: string;
  whatsNotIncluded: string;
  learningOutcomes: string;
  courseDemoVideo?: string;
  brochurePdfDownload: string[];
  refundCancellationPolicy: string;
  postTrainingSupport: string;
  contactForQueries: string;
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
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Training name should contain only letters and spaces",
      },
    },
    trainingUniqueCode: { type: String, required: true, trim: true, unique: true },
    trainingType: { type: String, required: true, trim: true },
    instituteName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value: string) => /^[A-Za-z ]+$/.test(value),
        message: "Institute name should contain only letters and spaces",
      },
    },
    trainingDuration: { type: String, required: true, trim: true },
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
    installmentEmiOption: { type: Boolean, default: false },
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
    trainingImage: { type: String, required: true, trim: true },
    trainerExperience: { type: String, required: true, trim: true },
    languageOfDelivery: {
      type: String,
      enum: ["English", "Hindi", "Bilingual"],
      required: true,
    },
    whatsIncluded: { type: String, required: true, trim: true },
    whatsNotIncluded: { type: String, required: true, trim: true },
    learningOutcomes: { type: String, required: true, trim: true },
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
    brochurePdfDownload: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one brochure PDF is required",
      },
    },
    refundCancellationPolicy: { type: String, required: true, trim: true },
    postTrainingSupport: { type: String, required: true, trim: true },
    contactForQueries: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const WorkshopTrainingModel =
  (models.WorkshopTraining as mongoose.Model<WorkshopTrainingDocument>) ||
  model<WorkshopTrainingDocument>("WorkshopTraining", WorkshopTrainingSchema);

export default WorkshopTrainingModel;
