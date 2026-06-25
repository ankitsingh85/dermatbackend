import mongoose, { Schema, Document } from "mongoose";

export interface IProductReview extends Document {
  productId: string;
  name: string;
  rating: number;
  comment: string;
}


const productReviewSchema =
new Schema<IProductReview>(
  {

    productId:{
      type:String,
      required:true,
    },


    name:{
      type:String,
      required:true,
    },


    rating:{
      type:Number,
      required:true,
      min:1,
      max:5,
    },


    comment:{
      type:String,
      required:true,
    },

  },
  {
    timestamps:true,
  }
);



export default mongoose.model<IProductReview>(
  "ProductReview",
  productReviewSchema
);