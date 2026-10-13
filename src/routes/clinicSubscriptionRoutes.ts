import express, { Request, Response } from "express";
import mongoose from "mongoose";
import ClinicSubscriptionPlan from "../models/clinicSubscriptionPlan";
import ClinicSubscription, { BillingCycle } from "../models/clinicSubscription";
import ClinicSubscriptionAddon from "../models/clinicSubscriptionAddon";
import Clinic from "../models/clinic";
import { clinicAuth, AuthRequest } from "../middleware/authClinic";
import { resolveOverride } from "../utils/clinicSubscriptionAccess";

const router = express.Router();

const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const getOrCreatePlan = async () => {
  let plan = await ClinicSubscriptionPlan.findOne();
  if (!plan) {
    plan = await ClinicSubscriptionPlan.create({});
  }
  return plan;
};

const priceForCycle = (plan: any, cycle: BillingCycle) =>
  cycle === "monthly"
    ? plan.monthlyPrice
    : cycle === "quarterly"
    ? plan.quarterlyPrice
    : plan.yearlyPrice;

/** Public: current plan pricing + feature list, shown on the clinic dashboard. */
router.get("/plan", async (_req: Request, res: Response) => {
  try {
    const plan = await getOrCreatePlan();
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch plan", error: err.message });
  }
});

/** Admin: edit the plan's pricing/features/active toggle. */
router.put("/plan", async (req: Request, res: Response) => {
  try {
    const plan = await getOrCreatePlan();
    const { planName, description, monthlyPrice, quarterlyPrice, yearlyPrice, isActive, features } =
      req.body;

    if (planName !== undefined) plan.planName = String(planName).trim();
    if (description !== undefined) plan.description = String(description).trim();
    if (monthlyPrice !== undefined) plan.monthlyPrice = Number(monthlyPrice);
    if (quarterlyPrice !== undefined) plan.quarterlyPrice = Number(quarterlyPrice);
    if (yearlyPrice !== undefined) plan.yearlyPrice = Number(yearlyPrice);
    if (isActive !== undefined) plan.isActive = Boolean(isActive);
    if (Array.isArray(features)) {
      plan.features = features.map((f: unknown) => String(f).trim()).filter(Boolean);
    }

    await plan.save();
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to update plan", error: err.message });
  }
});

/** Public: active add-ons clinics can attach to a subscription. */
router.get("/addons", async (_req: Request, res: Response) => {
  try {
    const addons = await ClinicSubscriptionAddon.find({ isActive: true }).sort({ createdAt: 1 });
    res.json(addons);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch add-ons", error: err.message });
  }
});

/** Admin: every add-on, active or not. */
router.get("/addons/all", async (_req: Request, res: Response) => {
  try {
    const addons = await ClinicSubscriptionAddon.find().sort({ createdAt: -1 });
    res.json(addons);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch add-ons", error: err.message });
  }
});

/** Admin: create an add-on. */
router.post("/addons", async (req: Request, res: Response) => {
  try {
    const { name, description, price, isActive } = req.body;
    if (!String(name || "").trim() || price === undefined || Number(price) < 0) {
      return res.status(400).json({ message: "Name and a valid price are required" });
    }

    const addon = await ClinicSubscriptionAddon.create({
      name: String(name).trim(),
      description: String(description || "").trim(),
      price: Number(price),
      isActive: isActive === undefined ? true : Boolean(isActive),
    });

    res.status(201).json(addon);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to create add-on", error: err.message });
  }
});

/** Admin: update an add-on. */
router.put("/addons/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid add-on id" });
    }

    const { name, description, price, isActive } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (price !== undefined) update.price = Number(price);
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    const addon = await ClinicSubscriptionAddon.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!addon) return res.status(404).json({ message: "Add-on not found" });
    res.json(addon);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to update add-on", error: err.message });
  }
});

/** Admin: delete an add-on from the catalog (existing subscriptions keep their snapshot). */
router.delete("/addons/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid add-on id" });
    }

    const addon = await ClinicSubscriptionAddon.findByIdAndDelete(id);
    if (!addon) return res.status(404).json({ message: "Add-on not found" });
    res.json({ message: "Add-on deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to delete add-on", error: err.message });
  }
});

/** Clinic: buy/renew a subscription, optionally with add-ons. Trusts the
 * Razorpay verify step the frontend already completed via /payments/verify
 * — the same trust boundary orderRoutes.ts uses for regular orders. */
router.post("/purchase", clinicAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clinicId = req.clinic?.id;
    if (!clinicId || !mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(401).json({ message: "Invalid clinic session" });
    }

    const { billingCycle, addonIds, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!["monthly", "quarterly", "yearly"].includes(billingCycle)) {
      return res.status(400).json({ message: "Invalid billing cycle" });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    const plan = await getOrCreatePlan();
    if (!plan.isActive) {
      return res.status(400).json({ message: "This plan is not available for purchase right now" });
    }

    const requestedAddonIds = Array.isArray(addonIds)
      ? addonIds.filter((id: unknown) => mongoose.Types.ObjectId.isValid(String(id)))
      : [];
    const selectedAddons =
      requestedAddonIds.length > 0
        ? await ClinicSubscriptionAddon.find({ _id: { $in: requestedAddonIds }, isActive: true })
        : [];

    const planAmount = priceForCycle(plan, billingCycle as BillingCycle);
    const addonsAmount = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
    const amount = planAmount + addonsAmount;

    const startDate = new Date();
    const endDate = addMonths(startDate, CYCLE_MONTHS[billingCycle as BillingCycle]);

    // Only one subscription should ever be "active" per clinic.
    await ClinicSubscription.updateMany(
      { clinicId, status: "active" },
      { $set: { status: "cancelled" } }
    );

    const subscription = await ClinicSubscription.create({
      clinicId,
      planName: plan.planName,
      billingCycle,
      planAmount,
      addonsAmount,
      amount,
      addons: selectedAddons.map((addon) => ({
        addonId: addon._id,
        name: addon.name,
        price: addon.price,
      })),
      startDate,
      endDate,
      status: "active",
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    res.status(201).json({ subscription, message: "Subscription activated successfully" });
  } catch (err: any) {
    console.error("❌ Error purchasing clinic subscription:", err.message);
    res.status(500).json({ message: "Failed to activate subscription", error: err.message });
  }
});

/** Clinic: own current subscription status. */
router.get("/clinic/:clinicId", clinicAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { clinicId } = req.params;
    if (clinicId !== req.clinic?.id) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: "Invalid clinicId" });
    }

    const subscription = await ClinicSubscription.findOne({ clinicId }).sort({ createdAt: -1 });
    const clinic = await Clinic.findById(clinicId).select(
      "whatsappOverride leadAccessOverride verifiedBadgeOverride"
    );

    let isActive = false;
    if (subscription) {
      isActive = subscription.status === "active" && subscription.endDate.getTime() >= Date.now();
      // Lazily correct stale "active" rows past their end date instead of
      // needing a cron job to sweep them.
      if (!isActive && subscription.status === "active") {
        subscription.status = "expired";
        await subscription.save();
      }
    }

    const whatsappVisible = resolveOverride(clinic?.whatsappOverride, isActive);
    const leadAccessVisible = resolveOverride(clinic?.leadAccessOverride, isActive);
    const verifiedBadgeVisible = resolveOverride(clinic?.verifiedBadgeOverride, isActive);

    res.json({ subscription, isActive, whatsappVisible, leadAccessVisible, verifiedBadgeVisible });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch subscription", error: err.message });
  }
});

/** Admin: every clinic + its latest subscription + whatsapp override, for the management list. */
router.get("/admin/all", async (_req: Request, res: Response) => {
  try {
    const clinics = await Clinic.find()
      .select(
        "clinicName contactNumber whatsapp whatsappOverride leadAccessOverride verifiedBadgeOverride"
      )
      .lean();

    const subscriptions = await ClinicSubscription.find().sort({ createdAt: -1 }).lean();
    const latestByClinic = new Map<string, any>();
    for (const sub of subscriptions) {
      const key = String(sub.clinicId);
      if (!latestByClinic.has(key)) latestByClinic.set(key, sub);
    }

    const now = Date.now();
    const rows = clinics.map((clinic: any) => {
      const sub = latestByClinic.get(String(clinic._id));
      const isActive = Boolean(sub && sub.status === "active" && new Date(sub.endDate).getTime() >= now);
      return {
        clinicId: clinic._id,
        clinicName: clinic.clinicName,
        contactNumber: clinic.contactNumber,
        whatsapp: clinic.whatsapp,
        whatsappOverride: clinic.whatsappOverride || "auto",
        leadAccessOverride: clinic.leadAccessOverride || "auto",
        verifiedBadgeOverride: clinic.verifiedBadgeOverride || "auto",
        whatsappVisible: resolveOverride(clinic.whatsappOverride, isActive),
        leadAccessVisible: resolveOverride(clinic.leadAccessOverride, isActive),
        verifiedBadgeVisible: resolveOverride(clinic.verifiedBadgeOverride, isActive),
        subscription: sub || null,
        isActive,
      };
    });

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch clinic subscriptions", error: err.message });
  }
});

const OVERRIDE_FIELDS = ["whatsappOverride", "leadAccessOverride", "verifiedBadgeOverride"] as const;

/** Admin: force the WhatsApp button, Lead dashboard access, or verified
 * badge on/off for a clinic, or hand control back to the plan. Accepts
 * any subset of the three override fields in the body. */
router.put("/admin/override/:clinicId", async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(clinicId)) {
      return res.status(400).json({ message: "Invalid clinicId" });
    }

    const updates: Record<string, string> = {};
    for (const field of OVERRIDE_FIELDS) {
      const value = req.body?.[field];
      if (value === undefined) continue;
      if (!["auto", "enabled", "disabled"].includes(value)) {
        return res.status(400).json({ message: `Invalid value for ${field}` });
      }
      updates[field] = value;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No override fields provided" });
    }

    const clinic = await Clinic.findByIdAndUpdate(clinicId, { $set: updates }, { new: true }).select(
      "clinicName whatsappOverride leadAccessOverride verifiedBadgeOverride"
    );

    if (!clinic) return res.status(404).json({ message: "Clinic not found" });
    res.json(clinic);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to update override", error: err.message });
  }
});

/** Admin: revoke a specific subscription record (e.g. after a refund). */
router.put("/admin/cancel/:subscriptionId", async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({ message: "Invalid subscriptionId" });
    }

    const subscription = await ClinicSubscription.findByIdAndUpdate(
      subscriptionId,
      { $set: { status: "cancelled" } },
      { new: true }
    );

    if (!subscription) return res.status(404).json({ message: "Subscription not found" });
    res.json(subscription);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to cancel subscription", error: err.message });
  }
});

export default router;
