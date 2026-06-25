import express from "express";
import TreatmentReview from "../models/treatmentReview";

const router = express.Router();

// CREATE REVIEW

router.post("/", async (req, res) => {
  try {
    const { treatmentId, name, rating, comment } = req.body;

    if (!treatmentId || !name || !rating || !comment) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const review = await TreatmentReview.create({
      treatmentId,
      name,
      rating,
      comment,
    });

    res.status(201).json({
      message: "Review added",
      review,
    });
  } catch (error) {
    res.status(500).json({
      message: "Review failed",
    });
  }
});

// GET REVIEWS

router.get("/:treatmentId", async (req, res) => {
  try {
    const reviews = await TreatmentReview.find({
      treatmentId: req.params.treatmentId,
    }).sort({
      createdAt: -1,
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({
      message: "Failed fetching reviews",
    });
  }
});

export default router;
