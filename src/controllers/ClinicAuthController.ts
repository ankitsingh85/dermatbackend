import { Request, Response } from "express";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import {
  buildClinicAddressFromText,
  cloneClinicAddresses,
  parseClinicAddresses,
} from "../utils/clinicAddresses";
import { generateNextClinicCuc } from "../utils/clinicCuc";
import { generateAuthToken } from "../utils/authToken";
import {
  assertVerifiedOtpSession,
  consumeVerifiedOtpSession,
  sendTwoFactorOtp,
  verifyTwoFactorOtp,
} from "../utils/twoFactorOtp";

const slugifyClinicName = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "clinic-detail-page";
};

export const buildUniqueClinicSlug = async (clinicName: string, excludeId?: string) => {
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

export type ClinicMobileLoginFields = {
  clinicName?: unknown;
  email?: unknown;
  address?: unknown;
  ownerName?: unknown;
  whatsapp?: unknown;
  dermaCategory?: unknown;
  addresses?: unknown;
};

export type ClinicMobileLoginResult = {
  status: number;
  body: Record<string, unknown>;
};

export const findClinicByContactNo = (contactNo: string) =>
  Clinic.findOne({ contactNumber: contactNo });

// Shared tail once we have a clinic document in hand (freshly created or
// pre-existing): consume the OTP session, gate on admin approval, issue
// the token. Used by both the self-registration and existing-clinic paths.
const finalizeClinicLogin = async (
  clinic: any,
  contactNo: string,
  otpSessionId: unknown
): Promise<ClinicMobileLoginResult> => {
  await consumeVerifiedOtpSession(otpSessionId, contactNo);

  // Admin approval gate — a clinic can't actually log in until an
  // admin has reviewed and approved its registration.
  if (clinic.approvalStatus === "pending") {
    return {
      status: 403,
      body: {
        message:
          "Your clinic registration is submitted and pending admin approval. You'll receive an email once it's reviewed.",
        pendingApproval: true,
      },
    };
  }

  if (clinic.approvalStatus === "rejected") {
    return {
      status: 403,
      body: {
        message: clinic.rejectionReason
          ? `Your clinic registration was rejected: ${clinic.rejectionReason}`
          : "Your clinic registration was rejected by the admin.",
        rejected: true,
      },
    };
  }

  const token = generateAuthToken(clinic._id.toString(), "clinic", contactNo);

  return {
    status: 200,
    body: {
      message: "Clinic login successful",
      token,
      role: "clinic",
      clinic: buildClinicPayload(clinic, contactNo),
    },
  };
};

// A clinic already exists for this contact number — fill in any fields it
// was missing, then finalize. Factored out so the unified business-login
// controller can call this directly once it has resolved the clinic.
export const resolveExistingClinicLogin = async (
  clinic: any,
  fields: ClinicMobileLoginFields,
  contactNo: string,
  otpSessionId: unknown
): Promise<ClinicMobileLoginResult> => {
  const clinicName = String(fields.clinicName ?? "").trim();
  const email = String(fields.email ?? "").trim().toLowerCase();
  const address = String(fields.address ?? "").trim();
  const ownerName = String(fields.ownerName ?? "").trim();
  const whatsapp = normalizeContactNumber(fields.whatsapp);
  const parsedAddresses = parseClinicAddresses(fields.addresses);

  await assertVerifiedOtpSession(otpSessionId, contactNo);

  const nextUpdates: Record<string, unknown> = {};
  const hasAddressesField = Object.prototype.hasOwnProperty.call(
    fields || {},
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

  if (!clinic) {
    return { status: 500, body: { message: "Unable to complete login" } };
  }

  return finalizeClinicLogin(clinic, contactNo, otpSessionId);
};

// Core clinic OTP-login/self-registration logic, factored out of the
// Express handler so it can be reused by the unified business-login
// controller (which resolves doctor vs. clinic before delegating here).
export const resolveClinicMobileLogin = async (
  fields: ClinicMobileLoginFields,
  contactNo: string,
  otpSessionId: unknown
): Promise<ClinicMobileLoginResult> => {
  const clinicName = String(fields.clinicName ?? "").trim();
  const email = String(fields.email ?? "").trim().toLowerCase();
  const address = String(fields.address ?? "").trim();
  const ownerName = String(fields.ownerName ?? "").trim();
  const whatsapp = normalizeContactNumber(fields.whatsapp);
  const dermaCategoryInput = String(fields.dermaCategory ?? "").trim();
  const parsedAddresses = parseClinicAddresses(fields.addresses);

  await assertVerifiedOtpSession(otpSessionId, contactNo);

  const clinic = await findClinicByContactNo(contactNo);

  if (clinic) {
    return resolveExistingClinicLogin(clinic, fields, contactNo, otpSessionId);
  }

  // Brand-new business signups only need a name and address — email
  // and everything else is optional here.
  if (!clinicName || !address) {
    return {
      status: 400,
      body: { message: "Name and address are required", needsProfile: true },
    };
  }

  if (email) {
    const existingByEmail = await Clinic.findOne({ email });
    if (existingByEmail) {
      return {
        status: 400,
        body: { message: "Email already registered with another clinic" },
      };
    }
  }

  const category =
    dermaCategoryInput && (await ClinicCategory.findById(dermaCategoryInput))
      ? dermaCategoryInput
      : (await ClinicCategory.findOne().sort({ createdAt: 1 }))?._id;

  if (!category) {
    return {
      status: 400,
      body: { message: "No clinic category available. Please create one first." },
    };
  }

  const createdClinic = await Clinic.create({
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
    email: email || undefined,
    contactNumber: contactNo,
    ownerName: ownerName || undefined,
    whatsapp: whatsapp || undefined,
    clinicStatus: "Open",
    // New self-registrations wait for an admin to approve them
    // before they can actually log in — see finalizeClinicLogin.
    approvalStatus: "pending",
  });

  return finalizeClinicLogin(createdClinic, contactNo, otpSessionId);
};

export const clinicMobileLogin = async (req: Request, res: Response) => {
  try {
    const contactNo = normalizeContactNumber(
      req.body?.contactNo ?? req.body?.contactNumber
    );

    if (contactNo.length !== 10) {
      return res
        .status(400)
        .json({ message: "Enter a valid 10 digit mobile number" });
    }

    const otpSessionId = req.body?.otpSessionId ?? req.body?.sessionId;
    const result = await resolveClinicMobileLogin(req.body || {}, contactNo, otpSessionId);

    return res.status(result.status).json(result.body);
  } catch (err: any) {
    console.error("Clinic mobile login error:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};
