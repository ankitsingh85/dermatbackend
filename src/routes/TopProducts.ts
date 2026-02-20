import express, { Request, Response } from "express";
import TopProductModel, { Product as TopSlot } from "../models/TopProducts";

const router = express.Router();
const MAX_TOP_PRODUCTS = 17;

// GET top products (always return 17 slots)
router.get("/", async (_req: Request, res: Response) => {
  try {
    let doc = await TopProductModel.findOne();
    if (!doc) {
      doc = await TopProductModel.create({
        products: Array(MAX_TOP_PRODUCTS).fill(null),
      });
      console.log("Created default top-products document");
    }

    const out = [...doc.products];
    while (out.length < MAX_TOP_PRODUCTS) out.push(null);
    res.json(out.slice(0, MAX_TOP_PRODUCTS));
  } catch (err) {
    console.error("Error fetching top products:", err);
    res.status(500).json({ error: "Failed to fetch top products" });
  }
});

// PUT update top products (expect array length up to 17, with nulls allowed)
router.put("/", async (req: Request, res: Response) => {
  try {
    let incoming = req.body as (TopSlot | null)[];

    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Body must be an array" });
    }

    incoming = incoming.slice(0, MAX_TOP_PRODUCTS);
    while (incoming.length < MAX_TOP_PRODUCTS) incoming.push(null);

    let doc = await TopProductModel.findOne();
    if (!doc) {
      doc = new TopProductModel({ products: incoming });
    } else {
      doc.products = incoming;
    }

    await doc.save();
    res.json(doc.products);
  } catch (err) {
    console.error("Error updating top products:", err);
    res.status(500).json({ error: "Failed to update top products" });
  }
});

export default router;
