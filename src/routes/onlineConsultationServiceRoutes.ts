import express, { Request, Response } from "express";
import mongoose from "mongoose";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import OnlineConsultationService from "../models/onlineConsultationService";
import Doctor from "../models/doctor";
import Order from "../models/order";
import Chat from "../models/chat";
import upload from "../middleware/uploads";
import { userAuth, UserAuthRequest } from "../middleware/authUser";
import { buildDoctorPayload } from "../controllers/DoctorAuthController";

const router = express.Router();

/* ================= SERVICE CODE GENERATOR =================
   Format: OnCon-<YYYYMM>-<N>
   e.g. "OnCon-202606-1", "OnCon-202606-2" ...
   "OnCon" is a fixed prefix. The sequence number increments dynamically
   per month, across all online consultation services.
*/
const SERVICE_CODE_PREFIX = "OnCon";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generateNextOnlineConsultationCode = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const prefix = `${SERVICE_CODE_PREFIX}-${year}${month}-`;
  const escapedPrefix = escapeRegExp(prefix);

  const existing = await OnlineConsultationService.find({
    serviceCode: { $regex: `^${escapedPrefix}\\d+$` },
  }).select("serviceCode");

  let maxSeq = 0;
  const seqRegex = new RegExp(`^${escapedPrefix}(\\d+)$`);

  for (const service of existing) {
    const match = service.serviceCode?.match(seqRegex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return `${prefix}${maxSeq + 1}`;
};

const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates a "HH:mm" string (24hr), or returns null for empty/undefined
 * (meaning "no restriction"). Returns an error message on invalid input. */
const validateTimeField = (value: unknown): { value?: string; error?: string } => {
  if (value === undefined || value === null || value === "") return { value: undefined };
  const str = String(value).trim();
  if (!TIME_RE.test(str)) {
    return { error: "Time must be in HH:mm 24hr format, e.g. 10:00" };
  }
  return { value: str };
};

const parseTimeToMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

/** Current time-of-day in IST (Asia/Kolkata), as minutes since midnight,
 * independent of the server's own timezone. */
const getIstNowMinutes = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
};

/** No start/end configured => always available. Equal start/end is also
 * treated as unrestricted (admin left both blank-equivalent). Start after
 * end is treated as an overnight window (e.g. 22:00-06:00). */
const isWithinAvailabilityWindow = (startTime?: string, endTime?: string) => {
  if (!startTime || !endTime) return true;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === endMinutes) return true;

  const nowMinutes = getIstNowMinutes();
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
};

const formatTime12h = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
};

const validateDoctorIds = async (doctorIds: string[]) => {
  for (const id of doctorIds) {
    if (!mongoose.isValidObjectId(id)) {
      return "Invalid doctor id";
    }
  }

  if (doctorIds.length === 0) return null;

  const count = await Doctor.countDocuments({ _id: { $in: doctorIds } });
  if (count !== doctorIds.length) {
    return "Some selected doctors are invalid";
  }

  return null;
};

router.get("/next-code", async (_req: Request, res: Response) => {
  try {
    const serviceCode = await generateNextOnlineConsultationCode();
    return res.json({ serviceCode });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to generate service code",
    });
  }
});

router.post("/", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { serviceType, consultationFee, offerPrice, discountPercent } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    if (!serviceType?.trim()) {
      return res.status(400).json({ message: "Service type is required" });
    }

    if (!uploadedImageUrl && !legacyImageUrl) {
      return res.status(400).json({ message: "Service image is required" });
    }

    const feeValue = Number(consultationFee);
    if (
      consultationFee === undefined ||
      consultationFee === "" ||
      Number.isNaN(feeValue) ||
      feeValue < 0
    ) {
      return res.status(400).json({ message: "Enter a valid consultation fee" });
    }

    const doctorIds = parseJsonArray(req.body.doctors);
    if (doctorIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one doctor" });
    }

    const doctorValidationError = await validateDoctorIds(doctorIds);
    if (doctorValidationError) {
      return res.status(400).json({ message: doctorValidationError });
    }

    let offerPriceValue: number | undefined;
    if (offerPrice !== undefined && offerPrice !== "") {
      offerPriceValue = Number(offerPrice);
      if (Number.isNaN(offerPriceValue) || offerPriceValue < 0) {
        return res.status(400).json({ message: "Enter a valid offer price" });
      }
    }

    let discountPercentValue = 0;
    if (discountPercent !== undefined && discountPercent !== "") {
      discountPercentValue = Number(discountPercent);
      if (
        Number.isNaN(discountPercentValue) ||
        discountPercentValue < 0 ||
        discountPercentValue > 100
      ) {
        return res.status(400).json({ message: "Discount % must be between 0 and 100" });
      }
    }

    const startTimeResult = validateTimeField(req.body.availabilityStartTime);
    if (startTimeResult.error) {
      return res.status(400).json({ message: startTimeResult.error });
    }
    const endTimeResult = validateTimeField(req.body.availabilityEndTime);
    if (endTimeResult.error) {
      return res.status(400).json({ message: endTimeResult.error });
    }
    if (
      (startTimeResult.value && !endTimeResult.value) ||
      (!startTimeResult.value && endTimeResult.value)
    ) {
      return res
        .status(400)
        .json({ message: "Set both a start and end time, or leave both blank" });
    }

    const serviceCode = await generateNextOnlineConsultationCode();

    const service = new OnlineConsultationService({
      serviceCode,
      serviceType: String(serviceType).trim(),
      doctors: doctorIds,
      imageUrl: uploadedImageUrl || legacyImageUrl,
      consultationFee: feeValue,
      ...(offerPriceValue !== undefined ? { offerPrice: offerPriceValue } : {}),
      discountPercent: discountPercentValue,
      ...(startTimeResult.value ? { availabilityStartTime: startTimeResult.value } : {}),
      ...(endTimeResult.value ? { availabilityEndTime: endTimeResult.value } : {}),
    });

    await service.save();
    const populated = await service.populate("doctors", "title firstName lastName specialist");
    res.status(201).json(populated);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create online consultation service", error: err });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const services = await OnlineConsultationService.find()
      .populate("doctors", "title firstName lastName specialist profileImage")
      .sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch online consultation services", error: err });
  }
});

/* ================= BULK UPLOAD ================= */

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getCell = (row: Record<string, unknown>, headers: string[]) => {
  for (const header of headers) {
    const foundKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
    if (foundKey) {
      const raw = row[foundKey];
      // A cell XLSX parsed as a date/time (cellDates:true) comes back as a
      // Date object — stringify it as ISO rather than via Date#toString(),
      // which is locale/timezone-formatted text that isn't reliably
      // re-parseable.
      if (raw instanceof Date) return raw.toISOString();
      return String(raw ?? "").trim();
    }
  }
  return "";
};

const splitList = (value: string) =>
  value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const readOnlineConsultationRows = (filePath: string) => {
  if (filePath.toLowerCase().endsWith(".csv")) {
    return parseCsvRows(fs.readFileSync(filePath));
  }
  // cellDates:true — converts a genuine Excel date-serial cell into a JS
  // Date instead of a raw serial number.
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
  });
};

router.post("/bulk-upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "CSV or Excel file required" });
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xls", "xlsx"].includes(ext)) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: "Only CSV, XLS, or XLSX files are allowed" });
    }

    const rows = readOnlineConsultationRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    const doctorDocs = await Doctor.find({}, "email title firstName lastName");
    const doctorIdByEmail = new Map<string, string>();
    // null = more than one doctor shares this display name — treated as
    // ambiguous rather than guessing which one was meant.
    const doctorIdByName = new Map<string, string | null>();
    for (const doctor of doctorDocs as any[]) {
      if (doctor.email) {
        doctorIdByEmail.set(String(doctor.email).trim().toLowerCase(), String(doctor._id));
      }
      const fullName = [doctor.title || "Dr.", doctor.firstName, doctor.lastName]
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLowerCase();
      if (fullName) {
        doctorIdByName.set(fullName, doctorIdByName.has(fullName) ? null : String(doctor._id));
      }
    }
    // The doctor picker on the manual form shows each doctor as
    // "Dr. Name — Specialist"; admins naturally copy that label into the
    // bulk sheet, so strip the " — Specialist" suffix before name-matching.
    const stripSpecialistSuffix = (value: string) => value.split(" — ")[0].trim();
    const resolveDoctorId = (raw: string): string | undefined => {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      if (trimmed.includes("@")) {
        return doctorIdByEmail.get(trimmed.toLowerCase());
      }
      return doctorIdByName.get(stripSpecialistSuffix(trimmed).toLowerCase()) || undefined;
    };

    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const serviceType = getCell(row, ["servicetype"]);
      const doctorsCell = getCell(row, ["doctors", "doctor", "doctoremails", "doctoremail"]);
      const consultationFeeCell = getCell(row, ["consultationfee", "fee"]);
      const offerPriceCell = getCell(row, ["offerprice"]);
      const discountPercentCell = getCell(row, ["discountpercent", "discount"]);
      const availabilityStartTimeCell = getCell(row, ["availabilitystarttime", "starttime"]);
      const availabilityEndTimeCell = getCell(row, ["availabilityendtime", "endtime"]);
      const imageUrl = getCell(row, ["imageurl", "image", "serviceimage"]);

      if (!serviceType) {
        skipped.push({ row: rowNumber, reason: "Service type is required" });
        continue;
      }

      if (!imageUrl) {
        skipped.push({ row: rowNumber, reason: "Service image is required" });
        continue;
      }

      const feeValue = Number(consultationFeeCell);
      if (!consultationFeeCell || Number.isNaN(feeValue) || feeValue < 0) {
        skipped.push({ row: rowNumber, reason: "Enter a valid consultation fee" });
        continue;
      }

      const doctorRefs = splitList(doctorsCell);
      if (doctorRefs.length === 0) {
        skipped.push({ row: rowNumber, reason: "Please select at least one doctor" });
        continue;
      }

      const doctorIds: string[] = [];
      let doctorNotFound = "";
      for (const ref of doctorRefs) {
        const id = resolveDoctorId(ref);
        if (!id) {
          doctorNotFound = ref;
          break;
        }
        doctorIds.push(id);
      }
      if (doctorNotFound) {
        skipped.push({ row: rowNumber, reason: `Doctor "${doctorNotFound}" not found` });
        continue;
      }

      let offerPriceValue: number | undefined;
      if (offerPriceCell) {
        offerPriceValue = Number(offerPriceCell);
        if (Number.isNaN(offerPriceValue) || offerPriceValue < 0) {
          skipped.push({ row: rowNumber, reason: "Enter a valid offer price" });
          continue;
        }
      }

      let discountPercentValue = 0;
      if (discountPercentCell) {
        discountPercentValue = Number(discountPercentCell);
        if (Number.isNaN(discountPercentValue) || discountPercentValue < 0 || discountPercentValue > 100) {
          skipped.push({ row: rowNumber, reason: "Discount % must be between 0 and 100" });
          continue;
        }
      }

      const startTimeResult = validateTimeField(availabilityStartTimeCell || undefined);
      if (startTimeResult.error) {
        skipped.push({ row: rowNumber, reason: startTimeResult.error });
        continue;
      }
      const endTimeResult = validateTimeField(availabilityEndTimeCell || undefined);
      if (endTimeResult.error) {
        skipped.push({ row: rowNumber, reason: endTimeResult.error });
        continue;
      }
      if (
        (startTimeResult.value && !endTimeResult.value) ||
        (!startTimeResult.value && endTimeResult.value)
      ) {
        skipped.push({
          row: rowNumber,
          reason: "Set both a start and end time, or leave both blank",
        });
        continue;
      }

      try {
        const serviceCode = await generateNextOnlineConsultationCode();
        const service = await OnlineConsultationService.create({
          serviceCode,
          serviceType,
          doctors: doctorIds,
          imageUrl,
          consultationFee: feeValue,
          ...(offerPriceValue !== undefined ? { offerPrice: offerPriceValue } : {}),
          discountPercent: discountPercentValue,
          ...(startTimeResult.value ? { availabilityStartTime: startTimeResult.value } : {}),
          ...(endTimeResult.value ? { availabilityEndTime: endTimeResult.value } : {}),
        });
        created.push(service);
      } catch (err: any) {
        skipped.push({ row: rowNumber, reason: err.message || "Failed to create online consultation service" });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid online consultation services found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} online consultation services uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

router.put("/:id", upload.single("imageUrl"), async (req: Request, res: Response) => {
  try {
    const { serviceType, consultationFee, offerPrice, discountPercent, isActive } = req.body;
    const uploadedImageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    const legacyImageUrl =
      typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";

    const service = await OnlineConsultationService.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Online consultation service not found" });
    }

    if (serviceType?.trim()) service.serviceType = String(serviceType).trim();
    if (uploadedImageUrl || legacyImageUrl) {
      service.imageUrl = uploadedImageUrl || legacyImageUrl;
    }

    if (consultationFee !== undefined && consultationFee !== "") {
      const feeValue = Number(consultationFee);
      if (Number.isNaN(feeValue) || feeValue < 0) {
        return res.status(400).json({ message: "Enter a valid consultation fee" });
      }
      service.consultationFee = feeValue;
    }

    if (offerPrice !== undefined && offerPrice !== "") {
      const offerPriceValue = Number(offerPrice);
      if (Number.isNaN(offerPriceValue) || offerPriceValue < 0) {
        return res.status(400).json({ message: "Enter a valid offer price" });
      }
      service.offerPrice = offerPriceValue;
    }

    if (discountPercent !== undefined && discountPercent !== "") {
      const discountPercentValue = Number(discountPercent);
      if (
        Number.isNaN(discountPercentValue) ||
        discountPercentValue < 0 ||
        discountPercentValue > 100
      ) {
        return res.status(400).json({ message: "Discount % must be between 0 and 100" });
      }
      service.discountPercent = discountPercentValue;
    }

    if (req.body.doctors !== undefined) {
      const doctorIds = parseJsonArray(req.body.doctors);
      if (doctorIds.length === 0) {
        return res.status(400).json({ message: "Please select at least one doctor" });
      }
      const doctorValidationError = await validateDoctorIds(doctorIds);
      if (doctorValidationError) {
        return res.status(400).json({ message: doctorValidationError });
      }
      service.doctors = doctorIds as any;
    }

    if (isActive !== undefined) {
      service.isActive = String(isActive).toLowerCase() === "true";
    }

    if (req.body.availabilityStartTime !== undefined || req.body.availabilityEndTime !== undefined) {
      const startTimeResult = validateTimeField(req.body.availabilityStartTime);
      if (startTimeResult.error) {
        return res.status(400).json({ message: startTimeResult.error });
      }
      const endTimeResult = validateTimeField(req.body.availabilityEndTime);
      if (endTimeResult.error) {
        return res.status(400).json({ message: endTimeResult.error });
      }
      if (
        (startTimeResult.value && !endTimeResult.value) ||
        (!startTimeResult.value && endTimeResult.value)
      ) {
        return res
          .status(400)
          .json({ message: "Set both a start and end time, or leave both blank" });
      }
      service.availabilityStartTime = startTimeResult.value;
      service.availabilityEndTime = endTimeResult.value;
    }

    const updated = await service.save();
    const populated = await updated.populate("doctors", "title firstName lastName specialist");
    res.json(populated);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update online consultation service", error: err });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const service = await OnlineConsultationService.findByIdAndDelete(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Online consultation service not found" });
    }

    res.json({ message: "Online consultation service deleted successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete online consultation service", error: err });
  }
});

/** ✅ USER: "Connect with Doctor" — on-demand match to whichever doctor
 * assigned to this service currently has isAvailableForConsultation:true.
 * The doctor's identity is only resolved/returned here, never before —
 * the frontend must not show any doctor details until this succeeds.
 *
 * Sticky match: if the user already has a chat with one of this service's
 * doctors, that same doctor is always returned (no re-matching on repeat
 * visits), so "everything ties up with the user" for that consultation.
 */
router.post("/:id/connect", userAuth, async (req: UserAuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Invalid or missing user" });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }

    const service = await OnlineConsultationService.findById(id).populate(
      "doctors",
      "title firstName lastName specialist profileImage isAvailableForConsultation"
    );
    if (!service) {
      return res.status(404).json({ message: "Online consultation service not found" });
    }

    // Only a user who actually paid for this service can be matched to a doctor.
    const hasPaid = await Order.exists({
      userId,
      orderType: "consultation",
      paymentStatus: "success",
      "products.id": id,
    });
    if (!hasPaid) {
      return res.status(403).json({ message: "Purchase this consultation to connect with a doctor" });
    }

    const assignedDoctors = (service.doctors || []) as any[];
    const assignedDoctorIds = assignedDoctors.map((doctor) => String(doctor._id));

    // Optional: the user picked a specific assigned doctor (e.g. from a
    // doctor picker) rather than being auto-matched to any available one.
    const requestedDoctorId = req.body?.doctorId ? String(req.body.doctorId) : "";
    if (requestedDoctorId && !assignedDoctorIds.includes(requestedDoctorId)) {
      return res.status(400).json({ message: "Selected doctor is not part of this consultation" });
    }

    // Sticky match — reuse an existing active (non-declined) chat so repeat
    // visits reconnect to the same doctor instead of starting over. Scoped
    // to the requested doctor when one was picked; otherwise any assigned
    // doctor. A declined chat is excluded so the user can be rematched.
    const existingChat = await Chat.findOne({
      userId,
      doctorId: requestedDoctorId ? requestedDoctorId : { $in: assignedDoctorIds },
      status: { $ne: "declined" },
    });

    if (existingChat) {
      const matchedDoctor = assignedDoctors.find(
        (doctor) => String(doctor._id) === String(existingChat.doctorId)
      );
      return res.json({
        matched: true,
        chatId: existingChat._id,
        chatStatus: existingChat.status,
        doctor: buildDoctorPayload(matchedDoctor),
      });
    }

    const withinWindow = isWithinAvailabilityWindow(
      service.availabilityStartTime,
      service.availabilityEndTime
    );

    if (!withinWindow) {
      const windowMessage =
        service.availabilityStartTime && service.availabilityEndTime
          ? `Doctors for this consultation are available between ${formatTime12h(
              service.availabilityStartTime
            )} and ${formatTime12h(service.availabilityEndTime)} (IST). Please try again during that window.`
          : "No doctors are available right now";
      return res.json({ matched: false, message: windowMessage });
    }

    let pickedDoctor: any;

    if (requestedDoctorId) {
      // A user-picked doctor is connected directly — no availability
      // filtering. The picker UI already shows online/offline status so the
      // user can choose knowingly; the window check above still applies.
      pickedDoctor = assignedDoctors.find(
        (doctor) => String(doctor._id) === requestedDoctorId
      );
    } else {
      // Inside an admin-configured window, that window is the sole
      // availability signal — doctors don't need to separately toggle
      // themselves online. With no window configured, fall back to
      // requiring the doctor's own toggle, since there's no other signal.
      const hasWindow = Boolean(service.availabilityStartTime && service.availabilityEndTime);
      const availableDoctors = hasWindow
        ? assignedDoctors
        : assignedDoctors.filter((doctor) => doctor.isAvailableForConsultation);

      if (availableDoctors.length === 0) {
        return res.json({ matched: false, message: "No doctors are available right now" });
      }

      pickedDoctor = availableDoctors[Math.floor(Math.random() * availableDoctors.length)];
    }

    const chat = await Chat.create({
      doctorId: pickedDoctor._id,
      userId,
      status: "accepted",
      respondedAt: new Date(),
    });

    return res.json({
      matched: true,
      chatId: chat._id,
      chatStatus: chat.status,
      doctor: buildDoctorPayload(pickedDoctor),
    });
  } catch (err: any) {
    console.error("Connect to doctor error:", err);
    return res.status(500).json({ message: "Failed to connect to a doctor", error: err.message });
  }
});

export default router;
