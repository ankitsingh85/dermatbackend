import express from "express";
import CourseReview from "../models/courseReview";

const router = express.Router();


/* CREATE REVIEW */

router.post("/", async (req,res)=>{

  try {

    const {
      courseId,
      name,
      rating,
      comment
    } = req.body;


    if(!courseId || !name || !rating || !comment){

      return res.status(400).json({
        message:"All fields required"
      });

    }


    const review =
      await CourseReview.create({
        courseId,
        name,
        rating,
        comment,
      });



    res.status(201).json({
      message:"Review added",
      review
    });


  } catch(error){

    res.status(500).json({
      message:"Review failed"
    });

  }

});
/* GET COURSE REVIEWS */


router.get("/:courseId", async(req,res)=>{

  try{

    const reviews =
      await CourseReview.find({
        courseId:req.params.courseId
      })
      .sort({
        createdAt:-1
      });



    res.json(reviews);


  }catch(error){

    res.status(500).json({
      message:"Failed fetching reviews"
    });

  }

});


export default router;