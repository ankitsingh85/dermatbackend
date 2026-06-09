import express from "express";
import jwt from "jsonwebtoken";
import Doctor from "../models/doctor";
import { doctorAuth, DoctorAuthRequest } from "../middleware/authDoctor";
import upload from "../middleware/uploads";
import {
  assertVerifiedOtpSession,
  consumeVerifiedOtpSession,
  sendTwoFactorOtp,
  verifyTwoFactorOtp,
} from "../utils/twoFactorOtp";

const router = express.Router();

const generateToken = (id: string, role: string, phone?: string) => {
  return jwt.sign(
    { id, role, phone },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1h" }
  );
};

const normalizePhone = (value: unknown) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .trim();

const normalizeText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");

const getUploadedPath = (file: Express.Multer.File | undefined) => {
  if (!file) return undefined;
  return `/uploads/${file.filename}`;
};

const DOCTOR_CODE_PREFIX = "ODUC";
const DOCTOR_CODE_DIGITS = 4;

const formatDoctorCode = (value: number) =>
  `${DOCTOR_CODE_PREFIX}${String(value).padStart(DOCTOR_CODE_DIGITS, "0")}`;

const getNextDoctorCode = async () => {
  const latestDoctor = await Doctor.findOne({
    doctorCode: { $regex: `^${DOCTOR_CODE_PREFIX}\\d+$` },
  })
    .sort({ doctorCode: -1 })
    .select("doctorCode")
    .lean();

  const latestNumber = Number(
    String(latestDoctor?.doctorCode || "")
      .replace(DOCTOR_CODE_PREFIX, "")
      .replace(/\D/g, "")
  );

  return formatDoctorCode(Number.isFinite(latestNumber) ? latestNumber + 1 : 1);
};

const normalizeAddressType = (value: unknown) => {
  const next = normalizeText(value);
  return next || "Office";
};

const formatAddressText = (addr: any) => {
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

const normalizeAddress = (addr: any) => {
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

const parseAddresses = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const buildDisplayName = (doctor: any) =>
  Array.from(
    new Set(
      [doctor?.title, doctor?.firstName, doctor?.lastName]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
  )
  ).join(" ") || doctor?.firstName || doctor?.lastName || "Doctor";

const buildDoctorPayload = (doctor: any, fallbackPhone?: string) => {
  if (!doctor) return null;

  const doctorId = doctor?._id?.toString?.() || doctor?.id || "";
  const phone = normalizePhone(doctor?.phone || fallbackPhone || "");

  return {
    id: doctorId,
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
    addresses: Array.isArray(doctor?.addresses)
      ? doctor.addresses.map(normalizeAddress)
      : [],
  };
};

const findDoctorByPhone = async (phone: string) => {
  const directMatch = await Doctor.findOne({ phone });
  if (directMatch) return directMatch;

  const doctors = await Doctor.find({
    phone: { $exists: true, $nin: [null, ""] },
  });

  return doctors.find((doctor) => normalizePhone(doctor.phone) === phone) || null;
};

/* ================= MOBILE OTP LOGIN ================= */
router.post("/send-login-otp", async (req, res) => {
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
});

router.post("/verify-login-otp", async (req, res) => {
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
});

router.post("/mobile-login", async (req, res) => {
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
    assertVerifiedOtpSession(otpSessionId, phone);

    const doctor = await findDoctorByPhone(phone);

    if (!doctor) {
      return res.status(404).json({
        message: "Doctor is not registered",
      });
    }

    consumeVerifiedOtpSession(otpSessionId, phone);

    const token = generateToken(doctor._id.toString(), "doctor", phone);

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
});

/* ================= GET CURRENT DOCTOR (ME) ================= */
router.get("/me", doctorAuth, async (req: DoctorAuthRequest, res) => {
  try {
    const doctorId = req.doctor?.id;
    if (!doctorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    return res.json(buildDoctorPayload(doctor));
  } catch (err: any) {
    console.error("Get doctor profile error:", err);
    return res.status(500).json({
      message: "Failed to fetch doctor",
      error: err.message,
    });
  }
});

/* ================= GET NEXT DOCTOR CODE ================= */
router.get("/next-code", async (_req, res) => {
  try {
    return res.json({ doctorCode: await getNextDoctorCode() });
  } catch (error) {
    return res.status(500).json({ message: "Failed to generate doctor code", error });
  }
});

/* ================= CREATE DOCTOR ================= */
router.post("/", upload.single("profileImage"), async (req, res) => {
  try {
    const {
      title,
      firstName,
      lastName,
      specialist,
      email,
      phone,
      description,
    } = req.body;
    const uploadedProfileImage = getUploadedPath(req.file);

    const cleanTitle = normalizeText(title);
    const cleanFirstName = normalizeText(firstName);
    const cleanLastName = normalizeText(lastName);
    const cleanSpecialist = normalizeText(specialist);
    const cleanEmail = normalizeText(email).toLowerCase();
    const cleanPhone = normalizePhone(phone);
    const cleanDescription = normalizeText(description);

    if (
      !cleanTitle ||
      !cleanFirstName ||
      !cleanLastName ||
      !cleanSpecialist ||
      !cleanEmail ||
      !cleanPhone
    ) {
      return res.status(400).json({ message: "All required fields missing" });
    }

    const exists = await Doctor.findOne({ email: cleanEmail });
    if (exists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const doctor = new Doctor({
      title: cleanTitle,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      doctorCode: await getNextDoctorCode(),
      specialist: cleanSpecialist,
      email: cleanEmail,
      phone: cleanPhone,
      description: cleanDescription || undefined,
      profileImage: uploadedProfileImage || "",
    });

    await doctor.save();

    res.status(201).json({
      message: "Doctor created successfully",
      doctor: {
        ...doctor.toObject(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ================= LIST DOCTORS ================= */
router.get("/", async (_req, res) => {
  try {
    const doctors = await Doctor.find().sort({ createdAt: -1 });

    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ================= UPDATE DOCTOR ================= */
router.put("/:id", upload.single("profileImage"), async (req, res) => {
  try {
    const uploadedProfileImage = getUploadedPath(req.file);

    const updateData: any = { ...req.body };

    if (typeof updateData.title === "string") {
      updateData.title = normalizeText(updateData.title);
    }
    if (typeof updateData.firstName === "string") {
      updateData.firstName = normalizeText(updateData.firstName);
    }
    if (typeof updateData.lastName === "string") {
      updateData.lastName = normalizeText(updateData.lastName);
    }
    if (typeof updateData.specialist === "string") {
      updateData.specialist = normalizeText(updateData.specialist);
    }
    if (typeof updateData.email === "string") {
      updateData.email = normalizeText(updateData.email).toLowerCase();
    }
    if (typeof updateData.phone === "string") {
      updateData.phone = normalizePhone(updateData.phone);
    }
    if (typeof updateData.description === "string") {
      updateData.description = normalizeText(updateData.description);
    }
    if (typeof updateData.address === "string") {
      updateData.address = normalizeText(updateData.address);
    }
    const parsedAddresses = parseAddresses(updateData.addresses);
    if (parsedAddresses) {
      updateData.addresses = parsedAddresses.map(normalizeAddress);
      updateData.address =
        updateData.address ||
        formatAddressText(updateData.addresses[0]) ||
        undefined;
    }

    if (uploadedProfileImage) {
      updateData.profileImage = uploadedProfileImage;
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedDoctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.json({
      message: "Doctor updated successfully",
      doctor: updatedDoctor,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

/* ================= DELETE DOCTOR ================= */
router.delete("/:id", async (req, res) => {
  try {
    const deletedDoctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!deletedDoctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.json({ message: "Doctor deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});
/* ================= CHECK DOCTOR MOBILE ================= */
router.post("/check-mobile", async (req, res) => {

  try {

    const phone = normalizePhone(
      req.body?.contactNo ??
      req.body?.phone ??
      req.body?.mobileNo
    );

    if (phone.length !== 10) {

      return res.status(400).json({
        message: "Enter valid mobile number",
        exists: false,
      });
    }

    const doctor =
      await findDoctorByPhone(phone);

    if (!doctor) {

      return res.status(404).json({
        exists: false,
        message: "Doctor is not registered",
      });
    }

    // ✅ TOKEN
    // ✅ RETURN FULL DOCTOR
    return res.status(200).json({
      exists: true,
      message: "Doctor exists",
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({
      exists: false,
      message: "Server error",
    });
  }
});
export default router;
