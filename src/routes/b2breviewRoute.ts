import express from "express";
import Review from "../models/b2breview";

const router = express.Router();

/* ================= ADD REVIEW ================= */

router.post("/", async (req, res) => {
  try {
    const { productId, name, rating, comment } = req.body;

    if (!productId || !name || !rating || !comment) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const review = await Review.create({
      productId,
      name,
      rating,
      comment,
    });

    res.status(201).json({
      message: "Review added successfully",

      review,
    });
  } catch (error) {
    res.status(500).json({
      message: "Review create failed",
    });
  }
});

/* ================= GET PRODUCT REVIEWS ================= */

router.get("/:productId", async (req, res) => {
  try {
    const reviews = await Review.find({
      productId: req.params.productId,
    }).sort({
      createdAt: -1,
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({
      message: "Reviews fetch failed",
    });
  }
});

export default router;
