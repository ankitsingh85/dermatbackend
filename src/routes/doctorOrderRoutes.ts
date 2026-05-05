import express from "express";
import mongoose from "mongoose";
import DoctorOrder from "../models/doctorOrder";

const router = express.Router();

const normalizeOrderType = (value: unknown) => {
  const next = String(value || "").toLowerCase();
  return next === "treatment" ? "treatment" : "product";
};

const hasItemType = (order: any, itemType: "product" | "treatment") => {
  const products = Array.isArray(order?.products) ? order.products : [];
  return products.some(
    (item: any) => String(item?.itemType || "").toLowerCase() === itemType
  );
};

const hasTreatmentName = (order: any) => {
  const products = Array.isArray(order?.products) ? order.products : [];
  return products.some((item: any) =>
    String(item?.name || "").toLowerCase().includes("treatment")
  );
};

const isLegacyTreatmentOrder = (order: any) => {
  const type = String(order?.address?.type || "").toLowerCase();
  const addressText = String(order?.address?.address || "").toLowerCase().trim();
  const orderName = String(order?.products?.[0]?.name || "").toLowerCase();
  return (
    type === "other" ||
    addressText.includes("treatment booking") ||
    addressText.includes("treatment") ||
    orderName.includes("treatment")
  );
};

const matchesOrderType = (order: any, requestedType?: string) => {
  if (!requestedType) return true;

  const normalized = normalizeOrderType(requestedType);
  const orderType = normalizeOrderType(order?.orderType);

  if (normalized === "treatment") {
    return (
      orderType === "treatment" ||
      hasItemType(order, "treatment") ||
      hasTreatmentName(order) ||
      isLegacyTreatmentOrder(order)
    );
  }

  return (
    !(
      orderType === "treatment" ||
      hasItemType(order, "treatment") ||
      hasTreatmentName(order) ||
      isLegacyTreatmentOrder(order)
    ) &&
    (hasItemType(order, "product") || orderType === "product")
  );
};

router.post("/", async (req, res) => {
  try {
    const { doctorId, products, totalAmount, address, orderType } = req.body;

    if (!doctorId || !products || !totalAmount || !address) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: "Invalid doctorId" });
    }

    const order = new DoctorOrder({
      doctorId,
      ownerType: "doctor",
      products,
      totalAmount,
      address,
      orderType: normalizeOrderType(orderType),
      paymentStatus: "success",
    });

    const savedOrder = await order.save();
    res.status(201).json(savedOrder);
  } catch (err: any) {
    console.error("Doctor order create error:", err.message);
    res.status(500).json({ message: "Failed to create doctor order", error: err.message });
  }
});

router.get("/my", async (req, res) => {
  try {
    const doctorId = req.headers["x-doctor-id"] as string;
    const requestedType = req.query.orderType as string | undefined;

    if (!doctorId) {
      return res.status(401).json({ message: "Doctor ID missing" });
    }

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: "Invalid doctor ID" });
    }

    const orders = await DoctorOrder.find({ doctorId })
      .populate("doctorId", "title firstName lastName email phone address")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json(requestedType ? orders.filter((order) => matchesOrderType(order, requestedType)) : orders);
  } catch (err: any) {
    console.error("Doctor order fetch error:", err.message);
    return res.status(500).json({ message: "Failed to fetch doctor orders", error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const requestedType = req.query.orderType as string | undefined;
    const orders = await DoctorOrder.find()
      .populate("doctorId", "title firstName lastName email phone address")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json(requestedType ? orders.filter((order) => matchesOrderType(order, requestedType)) : orders);
  } catch (err: any) {
    console.error("Doctor order all fetch error:", err.message);
    return res.status(500).json({ message: "Failed to fetch doctor orders", error: err.message });
  }
});

router.put("/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["Pending", "Shipped", "Delivered", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await DoctorOrder.findById(orderId);
    if (!order) return res.status(404).json({ message: "Doctor order not found" });

    order.status = status;
    await order.save();

    res.status(200).json({ message: "Doctor order status updated", order });
  } catch (err: any) {
    console.error("Doctor order status error:", err.message);
    res.status(500).json({ message: "Failed to update doctor order status", error: err.message });
  }
});

export default router;
