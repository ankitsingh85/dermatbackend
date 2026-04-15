import mongoose, { Document, Schema } from "mongoose";

export interface ITrainingType extends Document {
  name: string;
  imageUrl: string;
}

const TrainingTypeSchema = new Schema<ITrainingType>(
  {
    name: {
      type: String,
      required: [true, "Training type name is required"],
      trim: true,
    },
    imageUrl: {
      type: String,
      required: [true, "Training type image is required"],
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
      },
    },
  }
);

export default mongoose.model<ITrainingType>("TrainingType", TrainingTypeSchema);
