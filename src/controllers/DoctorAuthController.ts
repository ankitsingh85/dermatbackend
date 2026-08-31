import { Request, Response } from "express";
import Doctor from "../models/doctor";
import { generateAuthToken } from "../utils/authToken";
import {
  assertVerifiedOtpSession,
  consumeVerifiedOtpSession,
  sendTwoFactorOtp,
  verifyTwoFactorOtp,
} from "../utils/twoFactorOtp";

export const normalizePhone = (value: unknown) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .trim();

export const normalizeText = (value: unknown) =>
  String(value ?? "").trim().replace(/\s+/g, " ");

export const normalizeAddressType = (value: unknown) => {
  const next = normalizeText(value);
  return next || "Office";
};

export const formatAddressText = (addr: any) => {
  const parts = [
    addr?.houseNo,
    addr?.street,
    addr?.localArea,
    addr?.district,
    addr?.state,
    addr?.pincode,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean);

  return parts.join(", ") || normalizeText(addr?.address);
};

export const normalizeAddress = (addr: any) => {
  const normalized = {
    type: normalizeAddressType(addr?.type),
    fullName: normalizeText(addr?.fullName),
    mobileNo: normalizePhone(addr?.mobileNo),
    houseNo: normalizeText(addr?.houseNo),
    street: normalizeText(addr?.street),
    localArea: normalizeText(addr?.localArea),
    pincode: normalizePhone(addr?.pincode).slice(0, 6),
    district: normalizeText(addr?.district),
    state: normalizeText(addr?.state),
    address: normalizeText(addr?.address),
  };

  return {
    ...normalized,
    address: formatAddressText(normalized),
  };
};

const buildDisplayName = (doctor: any) =>
  Array.from(
    new Set(
      [doctor?.title, doctor?.firstName, doctor?.lastName]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
    )
  ).join(" ") || doctor?.firstName || doctor?.lastName || "Doctor";

export const buildDoctorPayload = (doctor: any, fallbackPhone?: string) => {
  if (!doctor) return null;

  const doctorId = doctor?._id?.toString?.() || doctor?.id || "";
  const phone = normalizePhone(doctor?.phone || fallbackPhone || "");

  return {
    id: doctorId,
    _id: doctorId,
    title: doctor?.title || "Dr.",
    firstName: doctor?.firstName || "",
    lastName: doctor?.lastName || "",
    doctorCode: doctor?.doctorCode || "",
    name: buildDisplayName(doctor),
    specialist: doctor?.specialist || "",
    email: doctor?.email || "",
    phone,
    contactNo: phone,
    description: doctor?.description || "",
    profileImage: doctor?.profileImage || "",
    address: doctor?.address || "",
    isAvailableForConsultation: Boolean(doctor?.isAvailableForConsultation),
    addresses: Array.isArray(doctor?.addresses)
      ? doctor.addresses.map(normalizeAddress)
      : [],
  };
};

export const findDoctorByPhone = async (phone: string) => {
  const directMatch = await Doctor.findOne({ phone });
  if (directMatch) return directMatch;

  const doctors = await Doctor.find({
    phone: { $exists: true, $nin: [null, ""] },
  });

  return doctors.find((doctor) => normalizePhone(doctor.phone) === phone) || null;
};

/* ================= MOBILE OTP LOGIN ================= */
export const sendDoctorLoginOtp = async (req: Request, res: Response) => {
  try {
    const phone = normalizePhone(
      req.body?.contactNo ?? req.body?.phone ?? req.body?.mobileNo
    );

    if (phone.length !== 10) {
      return res.status(400).json({
        message: "Enter a valid 10 digit mobile number",
      });
    }

    const doctor = await findDoctorByPhone(phone);

    if (!doctor) {
      return res.status(404).json({
        message: "Doctor is not registered",
        exists: false,
      });
    }

    const { sessionId } = await sendTwoFactorOtp(phone);

    return res.status(200).json({
      message: "OTP sent successfully",
      exists: true,
      contactNo: phone,
      sessionId,
    });
  } catch (err: any) {
    return res.status(400).json({
      message: err.message || "Unable to send OTP",
    });
  }
};

export const verifyDoctorLoginOtp = async (req: Request, res: Response) => {
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

export const doctorMobileLogin = async (req: Request, res: Response) => {
  try {
    const phone = normalizePhone(
      req.body?.contactNo ?? req.body?.phone ?? req.body?.mobileNo
    );

    if (phone.length !== 10) {
      return res.status(400).json({
        message: "Enter a valid 10 digit mobile number",
      });
    }

    const otpSessionId = req.body?.otpSessionId ?? req.body?.sessionId;
    await assertVerifiedOtpSession(otpSessionId, phone);

    const doctor = await findDoctorByPhone(phone);

    if (!doctor) {
      return res.status(404).json({
        message: "Doctor is not registered",
      });
    }

    await consumeVerifiedOtpSession(otpSessionId, phone);

    const token = generateAuthToken(doctor._id.toString(), "doctor", phone);

    return res.status(200).json({
      message: "Doctor login successful",
      token,
      role: "doctor",
      doctor: buildDoctorPayload(doctor, phone),
    });
  } catch (err: any) {
    console.error("Doctor mobile login error:", err);
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};
