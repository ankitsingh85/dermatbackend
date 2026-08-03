import express from "express";
import Doctor from "../models/doctor";
import { doctorAuth, DoctorAuthRequest } from "../middleware/authDoctor";
import upload from "../middleware/uploads";
import {
  buildDoctorPayload,
  findDoctorByPhone,
  formatAddressText,
  normalizeAddress,
  normalizePhone,
  normalizeText,
  sendDoctorLoginOtp,
  verifyDoctorLoginOtp,
  doctorMobileLogin,
} from "../controllers/DoctorAuthController";

const router = express.Router();

const getUploadedPath = (file: Express.Multer.File | undefined) => {
  if (!file) return undefined;
  return `/uploads/${file.filename}`;
};

const DOCTOR_CODE_PREFIX = "Dr";

const getNextDoctorCode = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yearMonth = `${year}${month}`;

  const lastDoctor = await Doctor.findOne({
    doctorCode: {
      $regex: `^${DOCTOR_CODE_PREFIX}-${yearMonth}-\\d+$`,
    },
  })
    .sort({ createdAt: -1 })
    .select("doctorCode")
    .lean();

  let nextSeries = 1;

  if (lastDoctor && lastDoctor.doctorCode) {
    const lastNumber = Number(lastDoctor.doctorCode.split("-").pop());

    if (!isNaN(lastNumber)) {
      nextSeries = lastNumber + 1;
    }
  }

  return `${DOCTOR_CODE_PREFIX}-${yearMonth}-${nextSeries}`;
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

/* ================= MOBILE OTP LOGIN ================= */
router.post("/send-login-otp", sendDoctorLoginOtp);

router.post("/verify-login-otp", verifyDoctorLoginOtp);

router.post("/mobile-login", doctorMobileLogin);

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
