import express from "express";
import ClinicReview from "../models/clinicReview";
import { userAuth, UserAuthRequest } from "../middleware/authUser";

const router = express.Router();

/* ADD REVIEW */

// Logged-in users only, and one review per user per clinic. The user comes
// from the verified token, never from the request body.
router.post("/", userAuth, async (req: UserAuthRequest, res) => {
  try {
    const { clinicId, name, rating, comment } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Please log in to write a review" });
    }
    if (!clinicId || !name || !rating || !comment) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const existing = await ClinicReview.findOne({ clinicId, userId });
    if (existing) {
      return res.status(409).json({
        message: "You have already reviewed this clinic.",
        review: existing,
      });
    }

    let review;
    try {
      review = await ClinicReview.create({
        clinicId,
        userId,
        name,
        rating,
        comment,
      });
    } catch (err: any) {
      // Two submits at once — the unique index caught the second one.
      if (err?.code === 11000) {
        return res.status(409).json({ message: "You have already reviewed this clinic." });
      }
      throw err;
    }

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

/* GET THE LOGGED-IN USER'S REVIEW FOR A CLINIC (or null) */

router.get("/:clinicId/mine", userAuth, async (req: UserAuthRequest, res) => {
  try {
    const review = await ClinicReview.findOne({
      clinicId: req.params.clinicId,
      userId: req.user?.id,
    });
    res.json({ review: review || null });
  } catch (error) {
    res.status(500).json({ message: "Failed loading review" });
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
