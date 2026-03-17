import mongoose, { Document, Schema } from "mongoose";

export interface ICourseType extends Document {
  id: string;
  name: string;
  imageUrl: string;
}

const CourseTypeSchema = new Schema<ICourseType>(
  {
    id: {
      type: String,
      required: [true, "Course type ID is required"],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Course type name is required"],
      trim: true,
    },
    imageUrl: {
      type: String,
      required: [true, "Course type image is required"],
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

export default mongoose.model<ICourseType>("CourseType", CourseTypeSchema);
