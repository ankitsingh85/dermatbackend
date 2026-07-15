import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import {
  buildClinicAddressFromText,
  cloneClinicAddresses,
  parseClinicAddresses,
} from "../utils/clinicAddresses";
import { generateNextClinicCuc } from "../utils/clinicCuc";
import {
  assertVerifiedOtpSession,
  consumeVerifiedOtpSession,
  sendTwoFactorOtp,
  verifyTwoFactorOtp,
} from "../utils/twoFactorOtp";

const generateToken = (id: string, role: string, contactNo?: string) => {
  return jwt.sign(
    { id, role, contactNo },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1h" }
  );
};

const slugifyClinicName = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "clinic-detail-page";
};

const buildUniqueClinicSlug = async (clinicName: string, excludeId?: string) => {
  const baseSlug = slugifyClinicName(clinicName);
  let slug = baseSlug;
  let counter = 2;

  while (
    await Clinic.findOne({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
};

const normalizeContactNumber = (value: unknown): string => {
  return String(value ?? "").replace(/\D/g, "").trim();
};

const buildClinicPayload = (clinic: any, contactNo?: string) => {
  const nextContactNo =
    clinic?.contactNumber || clinic?.contactNo || contactNo || "";
  const clinicId = clinic?._id?.toString?.() || clinic?.id || "";
  const addresses = cloneClinicAddresses(clinic?.addresses);

  return {
    id: clinicId,
    clinicName: clinic?.clinicName || "",
    email: clinic?.email || "",
    contactNo: nextContactNo,
    contactNumber: nextContactNo,
    ownerName: clinic?.ownerName || "",
    slug: clinic?.slug || "",
    clinicLogo: clinic?.clinicLogo || "",
    profileImage: clinic?.clinicLogo || "",
    address: addresses[0]?.address || clinic?.address || "",
    addresses,
  };
};

export const sendClinicLoginOtp = async (req: Request, res: Response) => {
  try {
    const { phone, sessionId } = await sendTwoFactorOtp(
      req.body?.contactNo ?? req.body?.contactNumber
    );

    return res.status(200).json({
      message: "OTP sent successfully",
      contactNo: phone,
      sessionId,
    });
  } catch (err: any) {
    return res.status(400).json({
      message: err.message || "Unable to send OTP",
    });
  }
};

export const verifyClinicLoginOtp = async (req: Request, res: Response) => {
  try {
    await verifyTwoFactorOtp(req.body?.sessionId, req.body?.otp);

    return res.status(200).json({
      message: "OTP verified successfully",
      verified: true,
    });
  } catch (err: any) {
    return res.status(400).json({
      message: err.message || "Invalid OTP",
      verified: false,
    });
  }
};

export const clinicMobileLogin = async (req: Request, res: Response) => {
  try {
    const contactNo = normalizeContactNumber(
      req.body?.contactNo ?? req.body?.contactNumber
    );
    const clinicName = String(req.body?.clinicName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const address = String(req.body?.address ?? "").trim();
    const ownerName = String(req.body?.ownerName ?? "").trim();
    const whatsapp = normalizeContactNumber(req.body?.whatsapp);
    const dermaCategoryInput = String(req.body?.dermaCategory ?? "").trim();
    const parsedAddresses = parseClinicAddresses(req.body?.addresses);

    if (contactNo.length !== 10) {
      return res
        .status(400)
        .json({ message: "Enter a valid 10 digit mobile number" });
    }

   const otpSessionId = req.body?.otpSessionId ?? req.body?.sessionId;

await assertVerifiedOtpSession(
  otpSessionId,
  contactNo
);

let clinic = await Clinic.findOne({
  contactNumber: contactNo
});

    if (!clinic) {
      if (!clinicName || !email || !address) {
        return res.status(400).json({
          message: "Clinic details are required",
          needsProfile: true,
        });
      }

      const existingByEmail = await Clinic.findOne({ email });
      if (existingByEmail) {
        return res.status(400).json({
          message: "Email already registered with another clinic",
        });
      }

      const category =
        dermaCategoryInput && (await ClinicCategory.findById(dermaCategoryInput))
          ? dermaCategoryInput
          : (await ClinicCategory.findOne().sort({ createdAt: 1 }))?._id;

      if (!category) {
        return res.status(400).json({
          message: "No clinic category available. Please create one first.",
        });
      }

      clinic = await Clinic.create({
        cuc: await generateNextClinicCuc(),
        clinicName,
        slug: await buildUniqueClinicSlug(clinicName),
        dermaCategory: category,
        address,
        addresses:
          parsedAddresses.length > 0
            ? parsedAddresses
            : [
                buildClinicAddressFromText(address, {
                  type: "Clinic",
                  fullName: clinicName,
                  mobileNo: contactNo,
                }),
              ],
        email,
        contactNumber: contactNo,
        ownerName: ownerName || undefined,
        whatsapp: whatsapp || undefined,
        clinicStatus: "Open",
        // New self-registrations wait for an admin to approve them
        // before they can actually log in — see the approvalStatus
        // check below.
        approvalStatus: "pending",
      });
    } else {
      const nextUpdates: Record<string, unknown> = {};
      const hasAddressesField = Object.prototype.hasOwnProperty.call(
        req.body || {},
        "addresses"
      );
      const nextAddresses = hasAddressesField ? parsedAddresses : [];

      if (!clinic.contactNumber) nextUpdates.contactNumber = contactNo;

      if (!clinic.clinicName && clinicName) nextUpdates.clinicName = clinicName;
      if (!clinic.email && email) nextUpdates.email = email;
      if (!clinic.address && address) nextUpdates.address = address;
      if (!clinic.address && parsedAddresses.length > 0) {
        nextUpdates.address = parsedAddresses[0]?.address || address;
      }
      if (!clinic.ownerName && ownerName) nextUpdates.ownerName = ownerName;
      if (!clinic.whatsapp && whatsapp) nextUpdates.whatsapp = whatsapp;
      if (hasAddressesField) nextUpdates.addresses = nextAddresses;

      if (Object.keys(nextUpdates).length > 0) {
        clinic = await Clinic.findByIdAndUpdate(clinic._id, nextUpdates, {
          new: true,
        });
      }
    }

    if (!clinic) {
      return res.status(500).json({ message: "Unable to complete login" });
    }

   await consumeVerifiedOtpSession(
  otpSessionId,
  contactNo
);

    // Admin approval gate — a clinic can't actually log in until an
    // admin has reviewed and approved its registration.
    if (clinic.approvalStatus === "pending") {
      return res.status(403).json({
        message:
          "Your clinic registration is submitted and pending admin approval. You'll receive an email once it's reviewed.",
        pendingApproval: true,
      });
    }

    if (clinic.approvalStatus === "rejected") {
      return res.status(403).json({
        message: clinic.rejectionReason
          ? `Your clinic registration was rejected: ${clinic.rejectionReason}`
          : "Your clinic registration was rejected by the admin.",
        rejected: true,
      });
    }

const token = generateToken(
  clinic._id.toString(),
  "clinic",
  contactNo
);

    return res.status(200).json({
      message: "Clinic login successful",
      token,
      role: "clinic",
      clinic: buildClinicPayload(clinic, contactNo),
    });
  } catch (err: any) {
    console.error("Clinic mobile login error:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};
