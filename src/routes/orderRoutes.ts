import express from "express";
import mongoose from "mongoose";
import Order from "../models/order";
import { userAuth, UserAuthRequest } from "../middleware/authUser";
// import UserProfile from "../models/userinformation";

const router = express.Router();

const normalizeOrderType = (value: unknown) => {
  const next = String(value || "").toLowerCase();
  if (next === "treatment") return "treatment";
  if (next === "consultation") return "consultation";
  return "product";
};

const hasItemType = (order: any, itemType: "product" | "treatment" | "consultation") => {
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

const isTreatmentLike = (order: any) => {
  const orderType = normalizeOrderType(order?.orderType);
  return (
    orderType === "treatment" ||
    hasItemType(order, "treatment") ||
    hasTreatmentName(order) ||
    isLegacyTreatmentOrder(order)
  );
};

const isConsultationLike = (order: any) => {
  const orderType = normalizeOrderType(order?.orderType);
  return orderType === "consultation" || hasItemType(order, "consultation");
};

const matchesOrderType = (order: any, requestedType?: string) => {
  if (!requestedType) return true;

  const normalized = normalizeOrderType(requestedType);
  const orderType = normalizeOrderType(order?.orderType);

  if (normalized === "treatment") {
    return isTreatmentLike(order);
  }

  if (normalized === "consultation") {
    return isConsultationLike(order);
  }

  return (
    !isTreatmentLike(order) &&
    !isConsultationLike(order) &&
    (hasItemType(order, "product") || orderType === "product")
  );
};

/** ✅ USER: Get the authenticated user's paid, successful consultation service IDs.
 * Auth is verified server-side from the JWT (req.user.id) — never trust a
 * client-supplied user id for this, since it gates access to a paid doctor's
 * video call. */
router.get("/my/consultation-access", userAuth, async (req: UserAuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Invalid or missing user" });
    }

    const orders = await Order.find({
      userId,
      orderType: "consultation",
      paymentStatus: "success",
    });

    const serviceIds = new Set<string>();
    orders.forEach((order: any) => {
      (order.products || []).forEach((product: any) => {
        if (String(product?.itemType || "").toLowerCase() === "consultation" && product?.id) {
          serviceIds.add(String(product.id));
        }
      });
    });

    return res.status(200).json({ serviceIds: Array.from(serviceIds) });
  } catch (err: any) {
    console.error("❌ Error fetching consultation access:", err.message);
    return res.status(500).json({ message: "Failed to fetch consultation access", error: err.message });
  }
});

/** ✅ Create new order */
router.post("/", async (req, res) => {
  try {
    const {
      userId,
      clinicId,
      b2bUserId,
      products,
      totalAmount,
      address,
      orderType,
      ownerType,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    if ((!userId && !clinicId && !b2bUserId) || !products || !totalAmount || !address) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    if (clinicId && !mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: "Invalid clinicId" });
    }

    if (b2bUserId && !mongoose.Types.ObjectId.isValid(b2bUserId)) {
      return res.status(400).json({ message: "Invalid b2bUserId" });
    }

    // const user = await UserProfile.findById(userId);
    // if (!user) return res.status(404).json({ message: "User not found" });

    const resolvedOwnerType =
      ownerType === "clinic" ? "clinic" : ownerType === "b2buser" ? "b2buser" : "user";

    const order = new Order({
      userId: resolvedOwnerType === "user" ? userId || undefined : undefined,
      clinicId: resolvedOwnerType === "clinic" ? clinicId || undefined : undefined,
      b2bUserId: resolvedOwnerType === "b2buser" ? b2bUserId || undefined : undefined,
      ownerType: resolvedOwnerType,
      products,
      totalAmount,
      address,
      orderType: normalizeOrderType(orderType),
      paymentStatus: "success",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    const savedOrder = await order.save();
    res.status(201).json(savedOrder);
  } catch (err: any) {
    console.error("❌ Error creating order:", err.message);
    res.status(500).json({ message: "Failed to create order", error: err.message });
  }
});

/** ✅ USER: Get orders for logged-in user */
/** ✅ USER: Get orders for logged-in user */
router.get("/my", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const clinicId = req.headers["x-clinic-id"] as string;
    const b2bUserId = req.headers["x-b2buser-id"] as string;
    const ownerType = String(req.headers["x-owner-type"] || "").toLowerCase();
    const requestedType = req.query.orderType as string | undefined;

    if (!userId && !clinicId && !b2bUserId) {
      return res.status(401).json({ message: "User, clinic, or B2B user ID missing" });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (clinicId && !mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: "Invalid clinic ID" });
    }

    if (b2bUserId && !mongoose.Types.ObjectId.isValid(b2bUserId)) {
      return res.status(400).json({ message: "Invalid B2B user ID" });
    }

    const query: any = {};
    if (ownerType === "clinic" || clinicId) {
      query.clinicId = clinicId;
    } else if (ownerType === "b2buser" || b2bUserId) {
      query.b2bUserId = b2bUserId;
    } else {
      query.userId = userId;
    }

    const orders = await Order.find(query)
      .populate("userId", "name email")
      .populate("clinicId", "clinicName email address contactNumber")
      .populate("b2bUserId", "name email contactNo")
      .sort({ createdAt: -1 });

    return res
      .status(200)
      .json(requestedType ? orders.filter((order) => matchesOrderType(order, requestedType)) : orders);
  } catch (err: any) {
    console.error("❌ Error fetching orders:", err.message);
    return res.status(500).json({ message: "Failed to fetch orders", error: err.message });
  }
});

/** ✅ ADMIN: Get all orders (from all users) */
router.get("/all", async (_req, res) => {
  try {
    const requestedType = _req.query.orderType as string | undefined;
    const orders = await Order.find()
      .populate("userId", "name email image")
      .populate("clinicId", "clinicName email address contactNumber")
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json(requestedType ? orders.filter((order) => matchesOrderType(order, requestedType)) : orders);
  } catch (err: any) {
    console.error("❌ Error fetching all orders:", err.message);
    res.status(500).json({ message: "Failed to fetch all orders", error: err.message });
  }
});

/** ✅ ADMIN: Update order status */
router.put("/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ["Pending", "Shipped", "Delivered", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    (order as any).status = status;
    await order.save();

    res.status(200).json({ message: "Order status updated", order });
  } catch (err: any) {
    console.error("❌ Error updating order status:", err.message);
    res.status(500).json({ message: "Failed to update order status", error: err.message });
  }
});

/** ✅ CLINIC: Delete one of the clinic's own orders (including orders
 * inherited from a "Become a Clinic" B2B conversion) */
router.delete("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const clinicId = req.headers["x-clinic-id"] as string;
    const ownerType = String(req.headers["x-owner-type"] || "").toLowerCase();

    if (ownerType !== "clinic" || !clinicId) {
      return res.status(403).json({ message: "Only a clinic can delete an order" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (String(order.clinicId) !== String(clinicId)) {
      return res.status(403).json({ message: "You can only delete your own clinic orders" });
    }

    await Order.findByIdAndDelete(orderId);
    res.status(200).json({ message: "Order deleted successfully" });
  } catch (err: any) {
    console.error("❌ Error deleting order:", err.message);
    res.status(500).json({ message: "Failed to delete order", error: err.message });
  }
});

export default router;
