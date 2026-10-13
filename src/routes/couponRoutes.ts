import express, { Request, Response } from "express";
import mongoose from "mongoose";
import Coupon from "../models/coupon";
import Order from "../models/order";
import Product from "../models/Products";
import TreatmentPlan from "../models/treatmentplans";

const router = express.Router();

const normalizeText = (value: unknown) => String(value ?? "").trim();

const friendlyFieldNames: Record<string, string> = {
  couponName: "Coupon name",
  couponCode: "Coupon code",
  discountType: "Discount type",
  discountValue: "Amount",
  serviceSection: "Service section",
};

const COUPON_CODE_PREFIX = "CPN";

const generateNextCouponId = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${COUPON_CODE_PREFIX}-${year}${month}-`;

  const last = await Coupon.findOne({
    couponId: { $regex: `^${prefix}\\d+$` },
  }).sort({ createdAt: -1 });

  let nextNumber = 1;
  if (last?.couponId) {
    const lastNumber = Number(last.couponId.split("-").pop());
    if (!Number.isNaN(lastNumber)) nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber}`;
};

const parseNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const parseDateOnly = (value: unknown): Date | undefined => {
  const str = String(value ?? "").trim();
  if (!str) return undefined;

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const date = new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? undefined : fallback;
};

/* Only couponName, couponCode, discountType, discountValue and
   serviceSection are mandatory — every other field is optional and, if
   provided, is still format-checked (but never required). Collects every
   failing check instead of returning on the first one, so the admin sees
   every problem in a single pass. */
const validateCouponPayload = (payload: Record<string, unknown>, isCreate = false) => {
  const errors: string[] = [];

  if (isCreate && !normalizeText(payload.couponName)) {
    errors.push(`${friendlyFieldNames.couponName} is required`);
  }

  if (isCreate && !normalizeText(payload.couponCode)) {
    errors.push(`${friendlyFieldNames.couponCode} is required`);
  }

  const discountType = normalizeText(payload.discountType);
  if (isCreate && !discountType) {
    errors.push(`${friendlyFieldNames.discountType} is required`);
  } else if (discountType && !["percent", "amount"].includes(discountType)) {
    errors.push('Discount type must be "percent" or "amount"');
  }

  if (
    isCreate &&
    (payload.discountValue === undefined || payload.discountValue === null || payload.discountValue === "")
  ) {
    errors.push(`${friendlyFieldNames.discountValue} is required`);
  } else if (payload.discountValue !== undefined && payload.discountValue !== "") {
    const discountValue = Number(payload.discountValue);
    if (Number.isNaN(discountValue) || discountValue < 0) {
      errors.push(`${friendlyFieldNames.discountValue} must be a valid positive number`);
    } else if (discountType === "percent" && discountValue > 100) {
      errors.push("Amount must be between 0 and 100 when discount type is percent");
    }
  }

  if (isCreate && !normalizeText(payload.serviceSection)) {
    errors.push(`${friendlyFieldNames.serviceSection} is required`);
  }

  const numericFieldsIfProvided = ["usageLimit", "perCustomerLimit", "cartValue", "maxDiscount"] as const;
  for (const field of numericFieldsIfProvided) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") continue;
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) {
      errors.push(`${field} must be a valid positive number`);
    }
  }

  const start = payload.startDate;
  const expiry = payload.expiryDate;
  if (start && expiry && start !== "INVALID_DATE" && expiry !== "INVALID_DATE") {
    const startDate = start instanceof Date ? start : new Date(String(start));
    const expiryDate = expiry instanceof Date ? expiry : new Date(String(expiry));
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(expiryDate.getTime()) && expiryDate < startDate) {
      errors.push("Expiry date must be on or after the start date");
    }
  }
  if (start === "INVALID_DATE") errors.push("Start date must be a valid date");
  if (expiry === "INVALID_DATE") errors.push("Expiry date must be a valid date");

  return errors.length ? { message: errors.join("; ") } : null;
};

router.get("/next-code", async (_req: Request, res: Response) => {
  try {
    const couponId = await generateNextCouponId();
    return res.json({ couponId });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to generate coupon ID" });
  }
});

/** Validates a coupon code against the live cart and returns the discount
 * to apply — called from checkout before the Razorpay order is created, so
 * the discounted amount is what actually gets charged. Every rejection
 * reason is returned as `message` so the checkout UI can show it directly. */
router.post("/apply", async (req: Request, res: Response) => {
  try {
    const { couponCode, serviceSection, cartValue, userId, itemIds } = req.body;
    const cleanCode = normalizeText(couponCode).toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ valid: false, message: "Enter a coupon code" });
    }

    const coupon = await Coupon.findOne({ couponCode: cleanCode });
    if (!coupon) {
      return res.status(404).json({ valid: false, message: "Invalid coupon code" });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ valid: false, message: "This coupon is no longer active" });
    }

    const now = new Date();
    if (coupon.startDate && now < coupon.startDate) {
      return res.status(400).json({ valid: false, message: "This coupon is not active yet" });
    }
    if (coupon.expiryDate && now > coupon.expiryDate) {
      return res.status(400).json({ valid: false, message: "This coupon has expired" });
    }

    if (coupon.usageLimit !== undefined && coupon.timesUsed >= coupon.usageLimit) {
      return res.status(400).json({ valid: false, message: "This coupon has reached its usage limit" });
    }

    const cleanServiceSection = normalizeText(serviceSection);
    if (
      coupon.serviceSection &&
      coupon.serviceSection !== "All" &&
      cleanServiceSection &&
      coupon.serviceSection !== cleanServiceSection
    ) {
      return res.status(400).json({
        valid: false,
        message: `This coupon only applies to ${coupon.serviceSection} purchases`,
      });
    }

    const cartValueNum = Number(cartValue) || 0;
    if (coupon.cartValue !== undefined && cartValueNum < coupon.cartValue) {
      return res.status(400).json({
        valid: false,
        message: `Add items worth at least ₹${coupon.cartValue} to use this coupon`,
      });
    }

    // Per-customer and new-user checks need an order history lookup —
    // derived from past orders rather than a separate usage table, so
    // there's nothing extra to keep in sync.
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      if (coupon.perCustomerLimit !== undefined) {
        const usedCount = await Order.countDocuments({
          userId,
          couponCode: cleanCode,
          paymentStatus: "success",
        });
        if (usedCount >= coupon.perCustomerLimit) {
          return res.status(400).json({
            valid: false,
            message: "You've already used this coupon the maximum number of times",
          });
        }
      }

      if (coupon.newUserOnly) {
        const priorOrders = await Order.countDocuments({ userId, paymentStatus: "success" });
        if (priorOrders > 0) {
          return res.status(400).json({
            valid: false,
            message: "This coupon is only valid for new users",
          });
        }
      }
    }

    // Sub-service match — only enforced for the two sections that currently
    // carry real per-item category data (Product, Treatment). If the admin
    // restricted the coupon to a specific sub-service, at least one item in
    // the cart must belong to it.
    if (coupon.subService && Array.isArray(itemIds) && itemIds.length > 0) {
      let matches = true;
      const validIds = itemIds.filter((id: unknown) => mongoose.isValidObjectId(id));

      if (coupon.serviceSection === "Product" && validIds.length) {
        const items = await Product.find({ _id: { $in: validIds } }).select("category").lean();
        matches = items.some((item: any) =>
          (item.category || []).some(
            (c: string) => c.toLowerCase() === String(coupon.subService).toLowerCase()
          )
        );
      } else if (coupon.serviceSection === "Treatment" && validIds.length) {
        const items = await TreatmentPlan.find({ _id: { $in: validIds } })
          .select("serviceCategory")
          .lean();
        matches = items.some((item: any) =>
          (item.serviceCategory || []).some(
            (c: string) => c.toLowerCase() === String(coupon.subService).toLowerCase()
          )
        );
      }

      if (!matches) {
        return res.status(400).json({
          valid: false,
          message: `This coupon only applies to "${coupon.subService}" items`,
        });
      }
    }

    let discount = coupon.discountType === "percent" ? (cartValueNum * coupon.discountValue) / 100 : coupon.discountValue;
    if (coupon.maxDiscount !== undefined) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
    discount = Math.round(Math.min(discount, cartValueNum) * 100) / 100;

    return res.json({
      valid: true,
      couponCode: coupon.couponCode,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
      finalAmount: Math.max(0, cartValueNum - discount),
      message: `Coupon applied! You saved ₹${discount}`,
    });
  } catch (err: any) {
    return res.status(500).json({ valid: false, message: err.message || "Failed to apply coupon" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};

    const payload: Record<string, unknown> = {
      couponName: normalizeText(body.couponName),
      couponCode: normalizeText(body.couponCode).toUpperCase(),
      discountType: normalizeText(body.discountType),
      discountValue: body.discountValue,
      startDate: parseDateOnly(body.startDate) ?? (body.startDate ? "INVALID_DATE" : undefined),
      expiryDate: parseDateOnly(body.expiryDate) ?? (body.expiryDate ? "INVALID_DATE" : undefined),
      serviceSection: normalizeText(body.serviceSection),
      usageLimit: body.usageLimit,
      perCustomerLimit: body.perCustomerLimit,
      cartValue: body.cartValue,
      maxDiscount: body.maxDiscount,
    };

    const validationError = validateCouponPayload(payload, true);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const existing = await Coupon.findOne({ couponCode: payload.couponCode });
    if (existing) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const couponId = await generateNextCouponId();

    const coupon = await Coupon.create({
      couponId,
      couponName: payload.couponName,
      couponCode: payload.couponCode,
      discountType: payload.discountType,
      discountValue: parseNumber(payload.discountValue),
      startDate: payload.startDate instanceof Date ? payload.startDate : undefined,
      expiryDate: payload.expiryDate instanceof Date ? payload.expiryDate : undefined,
      isActive: parseBoolean(body.isActive, true),
      usageLimit: parseNumber(payload.usageLimit),
      perCustomerLimit: parseNumber(payload.perCustomerLimit),
      serviceSection: payload.serviceSection,
      subService: normalizeText(body.subService),
      cartValue: parseNumber(payload.cartValue),
      newUserOnly: parseBoolean(body.newUserOnly, false),
      maxDiscount: parseNumber(payload.maxDiscount),
      isPublic: parseBoolean(body.isPublic, false),
    });

    return res.status(201).json(coupon);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Coupon code already exists" });
    }
    return res.status(500).json({ message: err.message || "Failed to create coupon" });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    return res.json(coupons);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to fetch coupons" });
  }
});

/** Public, currently-valid, admin-advertised coupons — used by the cart /
 * checkout UI to show users offers they didn't have to already know the
 * code for. Optionally filtered to a service section (matching coupons
 * with that section or scoped to "All"). Never exposes non-public coupons,
 * even if the caller guesses a valid serviceSection. */
router.get("/public", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const serviceSection = normalizeText(req.query.serviceSection);

    const query: Record<string, unknown> = {
      isPublic: true,
      isActive: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }] },
        { $or: [{ expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }] },
      ],
    };

    if (serviceSection) {
      query.$or = [{ serviceSection }, { serviceSection: "All" }];
    }

    const coupons = await Coupon.find(query)
      .select("couponCode couponName discountType discountValue serviceSection subService cartValue maxDiscount")
      .sort({ createdAt: -1 });

    return res.json(coupons);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to fetch public coupons" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    return res.json(coupon);
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to fetch coupon" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const updateData: Record<string, unknown> = {};

    if (body.couponName !== undefined) updateData.couponName = normalizeText(body.couponName);
    if (body.couponCode !== undefined) updateData.couponCode = normalizeText(body.couponCode).toUpperCase();
    if (body.discountType !== undefined) updateData.discountType = normalizeText(body.discountType);
    if (body.discountValue !== undefined) updateData.discountValue = body.discountValue;
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? parseDateOnly(body.startDate) ?? "INVALID_DATE" : undefined;
    }
    if (body.expiryDate !== undefined) {
      updateData.expiryDate = body.expiryDate ? parseDateOnly(body.expiryDate) ?? "INVALID_DATE" : undefined;
    }
    if (body.isActive !== undefined) updateData.isActive = parseBoolean(body.isActive, true);
    if (body.usageLimit !== undefined) updateData.usageLimit = body.usageLimit;
    if (body.perCustomerLimit !== undefined) updateData.perCustomerLimit = body.perCustomerLimit;
    if (body.serviceSection !== undefined) updateData.serviceSection = normalizeText(body.serviceSection);
    if (body.subService !== undefined) updateData.subService = normalizeText(body.subService);
    if (body.cartValue !== undefined) updateData.cartValue = body.cartValue;
    if (body.newUserOnly !== undefined) updateData.newUserOnly = parseBoolean(body.newUserOnly, false);
    if (body.maxDiscount !== undefined) updateData.maxDiscount = body.maxDiscount;
    if (body.isPublic !== undefined) updateData.isPublic = parseBoolean(body.isPublic, false);

    const validationError = validateCouponPayload(updateData, false);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    if (updateData.couponCode) {
      const existing = await Coupon.findOne({
        couponCode: updateData.couponCode,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }
    }

    const finalUpdate: Record<string, unknown> = { ...updateData };
    if ("discountValue" in finalUpdate) finalUpdate.discountValue = parseNumber(finalUpdate.discountValue);
    if ("usageLimit" in finalUpdate) finalUpdate.usageLimit = parseNumber(finalUpdate.usageLimit);
    if ("perCustomerLimit" in finalUpdate) finalUpdate.perCustomerLimit = parseNumber(finalUpdate.perCustomerLimit);
    if ("cartValue" in finalUpdate) finalUpdate.cartValue = parseNumber(finalUpdate.cartValue);
    if ("maxDiscount" in finalUpdate) finalUpdate.maxDiscount = parseNumber(finalUpdate.maxDiscount);
    if (finalUpdate.startDate === "INVALID_DATE") delete finalUpdate.startDate;
    if (finalUpdate.expiryDate === "INVALID_DATE") delete finalUpdate.expiryDate;

    const updated = await Coupon.findByIdAndUpdate(req.params.id, finalUpdate, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: "Coupon not found" });
    return res.json(updated);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Coupon code already exists" });
    }
    return res.status(500).json({ message: err.message || "Failed to update coupon" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Coupon not found" });
    return res.json({ message: "Coupon deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to delete coupon" });
  }
});

export default router;
