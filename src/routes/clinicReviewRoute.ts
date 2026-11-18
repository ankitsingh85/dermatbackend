import express from "express";
import ClinicReview from "../models/clinicReview";

const router = express.Router();

/* ADD REVIEW */

router.post("/", async (req, res) => {
  try {
    const { clinicId, name, rating, comment } = req.body;
    if (!clinicId || !name || !rating || !comment) {
      return res.status(400).json({
        message: "All fields required",
      });
    }
    const review = await ClinicReview.create({
      clinicId,
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

/* GET CLINIC REVIEWS */

router.get("/:clinicId", async (req, res) => {
  try {
    const reviews = await ClinicReview.find({
      clinicId: req.params.clinicId,
    }).sort({
      createdAt: -1,
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({
      message: "Failed loading reviews",
    });
  }
});
/* ================= CLINIC REPLY ================= */

router.patch(
  "/reply/:reviewId",
  async (req, res) => {
    try {
      const { reply } = req.body;

      if (!reply) {
        return res.status(400).json({
          message: "Reply required",
        });
      }


      const review =
        await ClinicReview.findByIdAndUpdate(
          req.params.reviewId,
          {
            reply,
            repliedAt: new Date(),
          },
          {
            new: true,
          }
        );


      if (!review) {
        return res.status(404).json({
          message: "Review not found",
        });
      }


      res.json({
        message: "Reply added",
        review,
      });


    } catch (error) {

      res.status(500).json({
        message: "Reply failed",
      });

    }
  }
);
export default router;
