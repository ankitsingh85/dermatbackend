import { Request, Response } from "express";
import B2BUser from "../models/B2BUser";
import { generateB2BUserId } from "../routes/b2bUserRoutes";
import {
  buildDoctorPayload,
  findDoctorByPhone,
  normalizePhone,
} from "./DoctorAuthController";
import { findClinicByContactNo, resolveExistingClinicLogin } from "./ClinicAuthController";
import { generateAuthToken } from "../utils/authToken";
import {
  assertVerifiedOtpSession,
  consumeVerifiedOtpSession,
  sendTwoFactorOtp,
  verifyTwoFactorOtp,
} from "../utils/twoFactorOtp";

const buildB2BUserPayload = (b2bUser: any) => ({
  id: b2bUser?._id?.toString?.() || "",
  b2bUserId: b2bUser?.b2bUserId || "",
  name: b2bUser?.name || "",
  contactPerson: b2bUser?.contactPerson || "",
  email: b2bUser?.email || "",
  contactNo: b2bUser?.contactNo || "",
  gstNumber: b2bUser?.gstNumber || "",
  address: b2bUser?.address || "",
  city: b2bUser?.city || "",
  state: b2bUser?.state || "",
  pincode: b2bUser?.pincode || "",
  status: b2bUser?.status || "active",
});

// Unified business login: a single mobile-number flow that transparently
// resolves to a doctor, an existing clinic, an existing B2B user, or —
// for a brand-new number — self-registers a new B2B user (Name + Address
// only). Doctors are never created here: only findDoctorByPhone matching
// an admin-created record grants the doctor role. Clinics are only
// reached by an existing Clinic record (e.g. via "Become a Clinic" —
// see B2BConversionController) — a brand-new number never becomes a
// clinic directly anymore.
export const sendBusinessLoginOtp = async (req: Request, res: Response) => {
  try {
    const { phone, sessionId } = await sendTwoFactorOtp(
      req.body?.contactNo ?? req.body?.contactNumber ?? req.body?.phone
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

export const verifyBusinessLoginOtp = async (req: Request, res: Response) => {
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

export const businessMobileLogin = async (req: Request, res: Response) => {
  try {
    const contactNo = normalizePhone(
      req.body?.contactNo ?? req.body?.contactNumber ?? req.body?.phone
    );

    if (contactNo.length !== 10) {
      return res
        .status(400)
        .json({ message: "Enter a valid 10 digit mobile number" });
    }

    const otpSessionId = req.body?.otpSessionId ?? req.body?.sessionId;
    await assertVerifiedOtpSession(otpSessionId, contactNo);

    const doctor = await findDoctorByPhone(contactNo);

    if (doctor) {
      await consumeVerifiedOtpSession(otpSessionId, contactNo);

      const token = generateAuthToken(doctor._id.toString(), "doctor", contactNo);

      return res.status(200).json({
        message: "Doctor login successful",
        token,
        role: "doctor",
        doctor: buildDoctorPayload(doctor, contactNo),
      });
    }

    const clinic = await findClinicByContactNo(contactNo);

    if (clinic) {
      const result = await resolveExistingClinicLogin(clinic, req.body || {}, contactNo, otpSessionId);
      return res.status(result.status).json(result.body);
    }

    const b2bUser = await B2BUser.findOne({ contactNo });

    if (b2bUser) {
      await consumeVerifiedOtpSession(otpSessionId, contactNo);

      const token = generateAuthToken(b2bUser._id.toString(), "b2buser", contactNo);

      return res.status(200).json({
        message: "Login successful",
        token,
        role: "b2buser",
        b2bUser: buildB2BUserPayload(b2bUser),
      });
    }

    // Brand-new number — self-register as a B2B user (Name + Address,
    // Email optional — captured up front so it's available later if this
    // account becomes a clinic, e.g. for admin-approval emails).
    const name = String(req.body?.name ?? req.body?.clinicName ?? "").trim();
    const address = String(req.body?.address ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();

    if (!name || !address) {
      return res.status(400).json({
        message: "Name and address are required",
        needsProfile: true,
      });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "Enter a valid email address",
        needsProfile: true,
      });
    }

    if (email) {
      const existingByEmail = await B2BUser.findOne({ email });
      if (existingByEmail) {
        return res.status(400).json({
          message: "Email already registered with another B2B account",
          needsProfile: true,
        });
      }
    }

    const createdB2BUser = await B2BUser.create({
      b2bUserId: await generateB2BUserId(),
      name,
      contactPerson: name,
      contactNo,
      address,
      ...(email ? { email } : {}),
      status: "active",
    });

    await consumeVerifiedOtpSession(otpSessionId, contactNo);

    const token = generateAuthToken(createdB2BUser._id.toString(), "b2buser", contactNo);

    return res.status(201).json({
      message: "B2B account created successfully",
      token,
      role: "b2buser",
      b2bUser: buildB2BUserPayload(createdB2BUser),
    });
  } catch (err: any) {
    console.error("Business mobile login error:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};
