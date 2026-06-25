import mongoose, { Schema, Document } from "mongoose";

export interface ICourseReview extends Document {
  courseId: string;
  name: string;
  rating: number;
  comment: string;
}

const courseReviewSchema = new Schema<ICourseReview>(
  {
    courseId: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);


export default mongoose.model<ICourseReview>(
  "CourseReview",
  courseReviewSchema
);
