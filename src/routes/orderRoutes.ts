import express from "express";
import mongoose from "mongoose";
import Order from "../models/order";
import Coupon from "../models/coupon";
import User from "../models/user";
import B2BUser from "../models/B2BUser";
import Clinic from "../models/clinic";
import { userAuth, UserAuthRequest } from "../middleware/authUser";
import { sendMail } from "../utils/email";
import {
  buildOrderConfirmationEmail,
  buildClinicTreatmentNotificationEmail,
  buildOrderCancellationEmail,
  buildClinicTreatmentCancellationEmail,
} from "../utils/orderConfirmationEmail";
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

// Resolves the buyer behind a saved order (by its own stored ownerType and
// id fields) to {name, email, phone} — shared by the cancellation-email
// flow below. Mirrors the inline lookup already used when an order is
// first created, but reads the identity straight off the order document
// instead of request-time variables, so it works for an order fetched
// independently later (e.g. when it's being cancelled).
const resolveOrderRecipient = async (order: {
  ownerType?: string;
  userId?: any;
  clinicId?: any;
  b2bUserId?: any;
}): Promise<{ name?: string; email?: string; phone?: string } | null> => {
  if (order.ownerType === "clinic" && order.clinicId) {
    const clinic = await Clinic.findById(order.clinicId).select("clinicName email contactNumber");
    return clinic ? { name: clinic.clinicName, email: clinic.email, phone: clinic.contactNumber } : null;
  }
  if (order.ownerType === "b2buser" && order.b2bUserId) {
    const b2bUser = await B2BUser.findById(order.b2bUserId).select("name email contactNo");
    return b2bUser ? { name: b2bUser.name, email: b2bUser.email, phone: b2bUser.contactNo } : null;
  }
  if (order.userId) {
    const user = await User.findById(order.userId).select("name email contactNo");
    return user ? { name: user.name, email: user.email, phone: user.contactNo } : null;
  }
  return null;
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
      couponCode,
      discountAmount,
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
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : undefined,
      discountAmount: discountAmount || undefined,
      address,
      orderType: normalizeOrderType(orderType),
      paymentStatus: "success",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    const savedOrder = await order.save();

    // Record usage against the coupon itself so admin-side reporting and
    // the usageLimit check both reflect it. Best-effort — a coupon-tracking
    // hiccup should never block an already-paid order from saving.
    if (savedOrder.couponCode) {
      Coupon.updateOne({ couponCode: savedOrder.couponCode }, { $inc: { timesUsed: 1 } }).catch(
        (err) => console.error("Failed to record coupon usage:", err)
      );
    }

    // Booking-confirmation email — best-effort, never blocks the response
    // for an already-paid order. Covers regular patient ("user") bookings
    // (products, courses, workshops/trainings, treatments, consultations —
    // they all flow through this same route), B2B product purchases, and
    // clinic business purchases; doctor checkouts aren't addressed here.
    const recipientLookup: Promise<{ name?: string; email?: string; phone?: string } | null> | null =
      resolvedOwnerType === "user" && savedOrder.userId
        ? User.findById(savedOrder.userId)
            .select("name email contactNo")
            .then((user) => (user ? { name: user.name, email: user.email, phone: user.contactNo } : null))
        : resolvedOwnerType === "b2buser" && savedOrder.b2bUserId
        ? B2BUser.findById(savedOrder.b2bUserId)
            .select("name email contactNo")
            .then((b2bUser) =>
              b2bUser ? { name: b2bUser.name, email: b2bUser.email, phone: b2bUser.contactNo } : null
            )
        : resolvedOwnerType === "clinic" && savedOrder.clinicId
        ? Clinic.findById(savedOrder.clinicId)
            .select("clinicName email contactNumber")
            .then((clinic) =>
              clinic
                ? { name: clinic.clinicName, email: clinic.email, phone: clinic.contactNumber }
                : null
            )
        : null;

    if (recipientLookup) {
      recipientLookup
        .then((recipient) => {
          if (!recipient?.email) return;

          const { subject, text, html } = buildOrderConfirmationEmail({
            recipientName: recipient.name || "",
            orderId: String(savedOrder._id),
            orderType: savedOrder.orderType,
            items: savedOrder.products.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              itemType: item.itemType,
              clinicName: item.clinicName,
              clinicAddress: item.clinicAddress,
            })),
            totalAmount: savedOrder.totalAmount,
            discountAmount: savedOrder.discountAmount,
            couponCode: savedOrder.couponCode,
            createdAt: savedOrder.createdAt || new Date(),
          });

          return sendMail(recipient.email, subject, text, html);
        })
        .catch((err) => console.error("Failed to send booking confirmation email:", err));
    }

    // Notify the clinic(s) picked at checkout (via the clinic-selection
    // step) for any treatment line items in this order — best-effort, same
    // fire-and-forget pattern as the buyer's own confirmation email above.
    // A single order normally books at one clinic, but group by clinicId
    // in case a future cart mixes treatments across clinics.
    const treatmentClinicGroups = new Map<
      string,
      { clinicName?: string; items: typeof savedOrder.products }
    >();
    savedOrder.products.forEach((item) => {
      if (item.itemType === "treatment" && item.clinicId) {
        const group = treatmentClinicGroups.get(item.clinicId) || {
          clinicName: item.clinicName,
          items: [],
        };
        group.items.push(item);
        treatmentClinicGroups.set(item.clinicId, group);
      }
    });

    if (treatmentClinicGroups.size > 0 && recipientLookup) {
      recipientLookup
        .then((buyer) => {
          treatmentClinicGroups.forEach((group, clinicId) => {
            Clinic.findById(clinicId)
              .select("clinicName email")
              .then((clinic) => {
                if (!clinic?.email) return;

                const amountForClinic = group.items.reduce(
                  (sum, item) => sum + item.price * item.quantity,
                  0
                );

                const { subject, text, html } = buildClinicTreatmentNotificationEmail({
                  clinicName: clinic.clinicName || group.clinicName || "",
                  orderId: String(savedOrder._id),
                  patientName: buyer?.name || "",
                  patientEmail: buyer?.email,
                  patientPhone: buyer?.phone,
                  items: group.items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                  })),
                  amountPaid: amountForClinic,
                  paymentId: savedOrder.razorpayPaymentId,
                  createdAt: savedOrder.createdAt || new Date(),
                });

                return sendMail(clinic.email, subject, text, html);
              })
              .catch((err) =>
                console.error("Failed to send clinic treatment-booking notification email:", err)
              );
          });
        })
        .catch((err) =>
          console.error("Failed to resolve buyer info for clinic notification email:", err)
        );
    }

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

/** ✅ OWNER: Cancel one of the requester's own orders (user, clinic, or
 * B2B user — scoped by the same identity headers as GET /my, so one
 * account can never cancel another account's order). */
router.put("/:orderId/cancel", async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const userId = req.headers["x-user-id"] as string;
    const clinicId = req.headers["x-clinic-id"] as string;
    const b2bUserId = req.headers["x-b2buser-id"] as string;
    const ownerType = String(req.headers["x-owner-type"] || "").toLowerCase();

    if (!userId && !clinicId && !b2bUserId) {
      return res.status(401).json({ message: "User, clinic, or B2B user ID missing" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const isOwner =
      ownerType === "clinic" || clinicId
        ? clinicId && String(order.clinicId) === String(clinicId)
        : ownerType === "b2buser" || b2bUserId
        ? b2bUserId && String(order.b2bUserId) === String(b2bUserId)
        : userId && String(order.userId) === String(userId);

    if (!isOwner) {
      return res.status(403).json({ message: "You can only cancel your own orders" });
    }

    if (order.status === "Cancelled") {
      return res.status(400).json({ message: "This order is already cancelled" });
    }
    if (order.status === "Delivered") {
      return res.status(400).json({ message: "A delivered order cannot be cancelled" });
    }

    order.status = "Cancelled";
    await order.save();

    // Cancellation emails — best-effort, never block the response. Mirrors
    // the booking-confirmation flow: the buyer always gets notified, and
    // the clinic (for any treatment line items that had one picked at
    // checkout) gets notified too.
    const cancelledAt = order.updatedAt || new Date();

    resolveOrderRecipient(order)
      .then((recipient) => {
        if (!recipient?.email) return;

        const { subject, text, html } = buildOrderCancellationEmail({
          recipientName: recipient.name || "",
          orderId: String(order._id),
          orderType: order.orderType,
          items: order.products.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            itemType: item.itemType,
            clinicName: item.clinicName,
            clinicAddress: item.clinicAddress,
          })),
          totalAmount: order.totalAmount,
          cancelledAt,
        });

        return sendMail(recipient.email, subject, text, html);
      })
      .catch((err) => console.error("Failed to send order cancellation email:", err));

    const treatmentClinicGroups = new Map<
      string,
      { clinicName?: string; items: typeof order.products }
    >();
    order.products.forEach((item) => {
      if (item.itemType === "treatment" && item.clinicId) {
        const group = treatmentClinicGroups.get(item.clinicId) || {
          clinicName: item.clinicName,
          items: [],
        };
        group.items.push(item);
        treatmentClinicGroups.set(item.clinicId, group);
      }
    });

    if (treatmentClinicGroups.size > 0) {
      resolveOrderRecipient(order)
        .then((buyer) => {
          treatmentClinicGroups.forEach((group, clinicId) => {
            Clinic.findById(clinicId)
              .select("clinicName email")
              .then((clinic) => {
                if (!clinic?.email) return;

                const { subject, text, html } = buildClinicTreatmentCancellationEmail({
                  clinicName: clinic.clinicName || group.clinicName || "",
                  orderId: String(order._id),
                  patientName: buyer?.name || "",
                  patientEmail: buyer?.email,
                  patientPhone: buyer?.phone,
                  items: group.items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                  })),
                  cancelledAt,
                });

                return sendMail(clinic.email, subject, text, html);
              })
              .catch((err) =>
                console.error("Failed to send clinic treatment-cancellation email:", err)
              );
          });
        })
        .catch((err) =>
          console.error("Failed to resolve buyer info for clinic cancellation email:", err)
        );
    }

    res.status(200).json({ message: "Order cancelled", order });
  } catch (err: any) {
    console.error("❌ Error cancelling order:", err.message);
    res.status(500).json({ message: "Failed to cancel order", error: err.message });
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
