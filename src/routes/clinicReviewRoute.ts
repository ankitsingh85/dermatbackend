import express from "express";
import ClinicReview from "../models/clinicReview";
import User from "../models/user";
import { userAuth, UserAuthRequest } from "../middleware/authUser";

const router = express.Router();

/* ADD REVIEW — only a logged-in user can post one, and only one per
   clinic; name/userId are stamped from the verified JWT, never from the
   request body, so a review can't be posted anonymously or impersonate
   someone else. */

router.post("/", userAuth, async (req: UserAuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Please log in to write a review" });
    }

    const { clinicId, rating, comment } = req.body;
    if (!clinicId || !rating || !comment) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const existing = await ClinicReview.findOne({ clinicId, userId });
    if (existing) {
      return res.status(409).json({ message: "You have already reviewed this clinic" });
    }

    const user = await User.findById(userId).select("name");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const review = await ClinicReview.create({
      clinicId,
      userId,
      name: user.name,
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

/* GET THE LOGGED-IN USER'S OWN REVIEW FOR THIS CLINIC (if any) */

router.get("/:clinicId/mine", userAuth, async (req: UserAuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Please log in" });
    }

    const review = await ClinicReview.findOne({
      clinicId: req.params.clinicId,
      userId,
    });

    res.json({ review: review || null });
  } catch (error) {
    res.status(500).json({
      message: "Failed loading your review",
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
