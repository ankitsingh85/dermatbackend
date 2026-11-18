import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Order from "../models/order";
import TreatmentCommission from "../models/treatmentCommission";

const router = express.Router();

// There's no fixed commission percentage anywhere in the system, so GST is
// the only derived figure here — a flat services rate applied to whatever
// clinic-payable amount the admin enters.
const GST_RATE = 0.18;

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

type TreatmentCommissionRow = {
  key: string;
  orderId: string;
  itemId: string;
  bookingDate: Date;
  customerName: string;
  customerEmail?: string;
  treatmentPackage: string;
  clinicId: string;
  clinicName: string;
  saleAmount: number;
  orderStatus: string;
  clinicPayableAmount: number;
  gstAmount: number;
  adjustmentAmount: number;
  netPayableAmount: number;
  settlementStatus: "Pending" | "Settled";
  settlementDate: Date | null;
  comments: string;
};

const buildRow = (
  order: any,
  item: any,
  record?: {
    clinicPayableAmount?: number;
    adjustmentAmount?: number;
    settlementStatus?: "Pending" | "Settled";
    settlementDate?: Date | null;
    comments?: string;
  }
): TreatmentCommissionRow => {
  const clinicPayableAmount = round2(record?.clinicPayableAmount || 0);
  const gstAmount = round2(clinicPayableAmount * GST_RATE);
  const adjustmentAmount = round2(record?.adjustmentAmount || 0);
  const netPayableAmount = round2(clinicPayableAmount + gstAmount + adjustmentAmount);

  return {
    key: `${order._id}_${item.id}`,
    orderId: String(order._id),
    itemId: item.id,
    bookingDate: order.createdAt,
    customerName: order.userId?.name || "Guest",
    customerEmail: order.userId?.email,
    treatmentPackage: item.name,
    clinicId: item.clinicId || "",
    clinicName: item.clinicName || "Not specified",
    saleAmount: round2((item.price || 0) * (item.quantity || 1)),
    // Mirrors the clinic's own OTP-verified "start treatment" flow — once
    // that's done, it's a more accurate status than the generic
    // product-shipping values, same as the admin Transactions table.
    orderStatus:
      order.status === "Cancelled"
        ? "Cancelled"
        : order.treatmentStartedAt
        ? "Treatment Started"
        : order.status || "Pending",
    clinicPayableAmount,
    gstAmount,
    adjustmentAmount,
    netPayableAmount,
    settlementStatus: record?.settlementStatus || "Pending",
    settlementDate: record?.settlementDate || null,
    comments: record?.comments || "",
  };
};

/** ✅ ADMIN: Every treatment booking, one row per treatment line item per
 * clinic — so a treatment booked at 3 different clinics across different
 * orders shows up as 3 rows. */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const orders = await Order.find({ "products.itemType": "treatment" })
      .populate("userId", "name email contactNo")
      .sort({ createdAt: -1 })
      .lean();

    const orderIds = orders.map((order: any) => order._id);
    const records = await TreatmentCommission.find({ orderId: { $in: orderIds } }).lean();
    const recordMap = new Map(records.map((r: any) => [`${r.orderId}_${r.itemId}`, r]));

    const rows: TreatmentCommissionRow[] = [];
    for (const order of orders as any[]) {
      const treatmentItems = (order.products || []).filter(
        (item: any) => item.itemType === "treatment"
      );
      for (const item of treatmentItems) {
        const record = recordMap.get(`${order._id}_${item.id}`);
        rows.push(buildRow(order, item, record));
      }
    }

    return res.json(rows);
  } catch (err: any) {
    console.error("❌ Error fetching treatment commissions:", err.message);
    return res.status(500).json({ message: "Failed to fetch treatment commissions" });
  }
});

/** ✅ CLINIC: Same rows as above, scoped to a single clinic — read-only view
 * of the settlement data admin has entered for that clinic's bookings. */
router.get("/clinic/:clinicId", async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.params;
    if (!clinicId) {
      return res.status(400).json({ message: "Clinic id is required" });
    }

    const orders = await Order.find({
      "products.itemType": "treatment",
      "products.clinicId": clinicId,
    })
      .populate("userId", "name email contactNo")
      .sort({ createdAt: -1 })
      .lean();

    const orderIds = orders.map((order: any) => order._id);
    const records = await TreatmentCommission.find({
      orderId: { $in: orderIds },
      clinicId,
    }).lean();
    const recordMap = new Map(records.map((r: any) => [`${r.orderId}_${r.itemId}`, r]));

    const rows: TreatmentCommissionRow[] = [];
    for (const order of orders as any[]) {
      const treatmentItems = (order.products || []).filter(
        (item: any) => item.itemType === "treatment" && item.clinicId === clinicId
      );
      for (const item of treatmentItems) {
        const record = recordMap.get(`${order._id}_${item.id}`);
        rows.push(buildRow(order, item, record));
      }
    }

    return res.json(rows);
  } catch (err: any) {
    console.error("❌ Error fetching clinic treatment commissions:", err.message);
    return res.status(500).json({ message: "Failed to fetch treatment commissions" });
  }
});

/** ✅ ADMIN: Upsert the manual-entry fields for one treatment booking row —
 * clinic payable amount, adjustment, settlement status/date, comments. */
router.put("/:orderId/:itemId", async (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId).populate("userId", "name email contactNo");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const item = order.products.find(
      (p: any) => p.id === itemId && p.itemType === "treatment"
    );
    if (!item) {
      return res.status(404).json({ message: "Treatment line item not found on this order" });
    }

    const { clinicPayableAmount, adjustmentAmount, settlementStatus, settlementDate, comments } =
      req.body || {};

    const update: Record<string, unknown> = { clinicId: item.clinicId };
    if (clinicPayableAmount !== undefined) {
      const parsed = Number(clinicPayableAmount);
      update.clinicPayableAmount = Number.isFinite(parsed) ? parsed : 0;
    }
    if (adjustmentAmount !== undefined) {
      const parsed = Number(adjustmentAmount);
      update.adjustmentAmount = Number.isFinite(parsed) ? parsed : 0;
    }
    if (settlementStatus !== undefined) {
      if (!["Pending", "Settled"].includes(settlementStatus)) {
        return res.status(400).json({ message: "Invalid settlement status" });
      }
      update.settlementStatus = settlementStatus;
    }
    if (settlementDate !== undefined) {
      update.settlementDate = settlementDate ? new Date(settlementDate) : null;
    }
    if (comments !== undefined) {
      update.comments = String(comments);
    }

    const record = await TreatmentCommission.findOneAndUpdate(
      { orderId, itemId },
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    return res.json(buildRow(order, item, record as any));
  } catch (err: any) {
    console.error("❌ Error updating treatment commission:", err.message);
    return res.status(500).json({ message: "Failed to update treatment commission" });
  }
});

export default router;
