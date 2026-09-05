import express, { Request, Response } from "express";
import fs from "fs";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../utils/bulkUploadCsv";
import mongoose from "mongoose";
import upload from "../middleware/uploads";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import B2BUser from "../models/B2BUser";
import Order from "../models/order";
import {
  buildClinicAddressFromText,
  formatClinicAddressText,
  mergeClinicAddresses,
  parseClinicAddresses,
  type ClinicAddress,
} from "../utils/clinicAddresses";
import { sendMail } from "../utils/email";
import { generateNextClinicCuc } from "../utils/clinicCuc";
const router = express.Router();
/* ================= LOCATION HELPERS ================= */


const extractLatLngFromMapLink = (url?: any) => {

  if (!url) return null;


  const match =
    String(url).match(
      /@(-?\d+\.\d+),(-?\d+\.\d+)/
    );


  if (!match) return null;


  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  };

};



const calculateDistanceKm = (
  lat1:number,
  lon1:number,
  lat2:number,
  lon2:number
)=>{


const R = 6371;


const dLat =
(lat2-lat1) * Math.PI / 180;


const dLon =
(lon2-lon1) * Math.PI / 180;



const a =
Math.sin(dLat/2)
*
Math.sin(dLat/2)
+
Math.cos(lat1*Math.PI/180)
*
Math.cos(lat2*Math.PI/180)
*
Math.sin(dLon/2)
*
Math.sin(dLon/2);



return (
R *
2 *
Math.atan2(
Math.sqrt(a),
Math.sqrt(1-a)
)

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

const buildUniqueClinicSlug = async (
  clinicName: string,
  excludeId?: string
) => {
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

const ensureClinicSlug = async (clinic: any) => {
  if (!clinic) return clinic;
  if (clinic.slug) return clinic;

  clinic.slug = await buildUniqueClinicSlug(
    clinic.clinicName || "clinic-detail-page",
    clinic._id?.toString()
  );
  await clinic.save();
  return clinic;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const parseDoctors = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeContactNumber = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").trim();

const parseBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["true", "yes", "1", "active"].includes(value.trim().toLowerCase());
  }

  return fallback;
};

const normalizeDoctors = (value: unknown) => {
  const parsed = parseDoctors(value);

  return parsed
    .map((item) => ({
      name: typeof item?.name === "string" ? item.name.trim() : "",
      regNo: typeof item?.regNo === "string" ? item.regNo.trim() : "",
      specialization:
        typeof item?.specialization === "string"
          ? item.specialization.trim()
          : "",
    }))
    .filter(
      (item) => item.name && item.regNo && item.specialization
    );
};

/* ================= WORKING HOURS HELPER =================
   Expected shape (sent as a JSON string from the frontend):
   {
     openTime: "09:00",
     closeTime: "18:00",
     days: ["Monday", "Tuesday", ...],   // days clinic is open
     offDays: ["Sunday"]                 // days clinic is closed
   }
*/
interface ClinicWorkingHoursInput {
  openTime: string;
  closeTime: string;
  days: string[];
  offDays: string[];
}

const VALID_WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const parseWorkingHours = (value: unknown): ClinicWorkingHoursInput => {
  let parsed: any = value;

  if (typeof value === "string") {
    try {
      parsed = value.trim() ? JSON.parse(value) : {};
    } catch {
      parsed = {};
    }
  }

  if (!parsed || typeof parsed !== "object") parsed = {};

  const sanitizeDayList = (list: unknown): string[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => VALID_WEEK_DAYS.includes(item));
  };

  return {
    openTime: typeof parsed.openTime === "string" ? parsed.openTime.trim() : "",
    closeTime: typeof parsed.closeTime === "string" ? parsed.closeTime.trim() : "",
    days: sanitizeDayList(parsed.days),
    offDays: sanitizeDayList(parsed.offDays),
  };
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

const hasOwn = (obj: Record<string, unknown> | undefined, key: string) =>
  Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));

const buildClinicAddressesFromRequest = (
  body: Record<string, unknown> | undefined,
  fallbackAddress: string,
  clinicName: string,
  contactNumber: string
): ClinicAddress[] => {
  const parsedAddresses = parseClinicAddresses(body?.addresses);
  if (parsedAddresses.length > 0) {
    return mergeClinicAddresses([], parsedAddresses);
  }

  if (fallbackAddress.trim()) {
    return [
      buildClinicAddressFromText(fallbackAddress, {
        type: "Clinic",
        fullName: clinicName,
        mobileNo: contactNumber,
      }),
    ];
  }

  return [];
};

const stripHeavyClinicFields = (clinic: any) => {
  const clone =
    typeof clinic?.toObject === "function" ? clinic.toObject() : { ...clinic };

  if (typeof clone.clinicLogo === "string" && clone.clinicLogo.startsWith("data:")) {
    clone.clinicLogo = "";
  }
  if (typeof clone.bannerImage === "string" && clone.bannerImage.startsWith("data:")) {
    clone.bannerImage = "";
  }
  if (Array.isArray(clone.photos)) {
    clone.photos = clone.photos.filter(
      (item: string) => typeof item === "string" && !item.startsWith("data:")
    );
  }
  return clone;
};

/* ================= CREATE CLINIC ================= */
router.post(
  "/",
  upload.fields([
    { name: "clinicLogo", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
    { name: "rateCard", maxCount: 1 },
    { name: "specialOffers", maxCount: 5 },
    { name: "photos", maxCount: 10 },
    { name: "certifications", maxCount: 5 },
  ]),
  async (req: Request, res: Response) => {
  try {
    const files = req.files as
      | {
          [fieldname: string]: Express.Multer.File[];
        }
      | undefined;

    const {
      clinicName,
      dermaCategory,
      address,
      addresses: _addresses,
      email,
      contactNo,
      contactNumber,
      whatsapp,
      doctors,
      workingHours,
      video,
      verifiedBadge,
      isActive,
      ...rest
    } = req.body;

    const normalizedContactNumber =
      normalizeContactNumber(contactNumber) ||
      normalizeContactNumber(contactNo);
    const normalizedWhatsapp = normalizeContactNumber(whatsapp);

    // Only clinic name, category, contact number and WhatsApp number are
    // mandatory to create a clinic — everything else is optional.
    if (!clinicName || !dermaCategory || !normalizedContactNumber || !normalizedWhatsapp) {
      return res.status(400).json({
        message: "Clinic name, category, contact number and WhatsApp number are required",
      });
    }

    const categoryExists = await ClinicCategory.findById(dermaCategory);
    if (!categoryExists) {
      return res.status(400).json({ message: "Invalid clinic category" });
    }

    const parsedDoctors = normalizeDoctors(doctors);
    const parsedWorkingHours = parseWorkingHours(workingHours);

    // CUC now uses a fixed "ClinicName" prefix + current year/month + a
    // global sequence number that increments per month, e.g.
    // "ClinicName-202606-1", "ClinicName-202606-2", "ClinicName-202606-3" ...
    const nextCuc = await generateNextClinicCuc();

    const clinicAddresses = buildClinicAddressesFromRequest(
      req.body,
      String(address ?? "").trim(),
      String(clinicName).trim(),
      normalizedContactNumber
    );
    const nextAddressText =
      clinicAddresses[0]?.address ||
      formatClinicAddressText(clinicAddresses[0]) ||
      String(address ?? "").trim();

    const uploadedClinicLogo = getUploadedPaths(files?.clinicLogo);
    const uploadedBannerImage = getUploadedPaths(files?.bannerImage);
    const uploadedRateCard = getUploadedPaths(files?.rateCard);
    const uploadedSpecialOffers = getUploadedPaths(files?.specialOffers);
    const uploadedPhotos = getUploadedPaths(files?.photos);
    const uploadedCertifications = getUploadedPaths(files?.certifications);
const location = extractLatLngFromMapLink(rest.mapLink);
    const clinic = await Clinic.create({
      cuc: nextCuc,
      clinicName: String(clinicName).trim(),
      slug: await buildUniqueClinicSlug(String(clinicName).trim()),
      dermaCategory,
      address: nextAddressText,
      addresses: clinicAddresses,
      ...(email ? { email: String(email).trim() } : {}),


// ADD THESE TWO

latitude:
location?.latitude || null,


longitude:
location?.longitude || null,



      contactNumber: normalizedContactNumber,
      whatsapp: normalizedWhatsapp,
      doctors: parsedDoctors,
      workingHours: parsedWorkingHours,
      clinicLogo: uploadedClinicLogo[0] || undefined,
      bannerImage: uploadedBannerImage[0] || undefined,
      rateCard: uploadedRateCard,
      specialOffers: uploadedSpecialOffers,
      photos: uploadedPhotos,
      certifications: uploadedCertifications,
      video: video,
      verifiedBadge: parseBoolean(verifiedBadge, false),
      isActive: parseBoolean(isActive, true),
      ...rest,
    });

    res.status(201).json({
      message: "Clinic created successfully",
      clinic,
    });
   } catch (err: any) {

    console.error("Create clinic error:", err);

    if (err?.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || "field";
      const value = err.keyValue?.[field];
      return res.status(400).json({
        message: `A clinic with this ${field} already exists (${value}).`,
        error: err.message,
      });
    }

    res.status(500).json({
      message: "Failed to create clinic",
      error: err.message,
    });

  }

 }
);

/* ================= BULK CREATE ================= */

const normalizeHeader = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const getCell = (row: Record<string, unknown>, headers: string[]) => {
  for (const header of headers) {
    const foundKey = Object.keys(row).find((key) => normalizeHeader(key) === header);
    if (foundKey) return String(row[foundKey] ?? "").trim();
  }
  return "";
};

const readClinicRows = (filePath: string) => {
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

const splitList = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

// "Dr. A|REG123|Dermatologist;Dr. B|REG456|Cosmetologist" -> doctor objects
const parseDoctorsCell = (value: string) =>
  value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, regNo, specialization] = entry.split("|").map((p) => (p || "").trim());
      return { name: name || "", regNo: regNo || "", specialization: specialization || "" };
    })
    .filter((doc) => doc.name && doc.regNo && doc.specialization);

// Every column here matches a field on the manual "Create Clinic" form
// (CreateClinic.tsx) 1:1 — cuc/slug are the only exceptions, since those
// are always auto-generated, same as on the manual form. Media fields
// (logo/banner/rateCard/specialOffers/photos/certifications/video) take
// URLs instead of file uploads, same pattern as the other bulk-upload
// endpoints in this app.
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

    const rows = readClinicRows(req.file.path);
    fs.unlink(req.file.path, () => undefined);

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    // Clinic category is stored as a dermaCategory ObjectId, but a bulk row
    // gives a human-readable name — resolve every distinct name mentioned
    // anywhere in the file to its _id in one query rather than per row.
    const allCategories = await ClinicCategory.find({}).select("_id name").lean();
    const categoryIdByName = new Map(
      allCategories.map((cat) => [cat.name.trim().toLowerCase(), String(cat._id)])
    );

    const skipped: { row: number; reason: string }[] = [];
    const created: unknown[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      const clinicName = getCell(row, ["clinicname", "name"]);
      const categoryName = getCell(row, ["dermacategory", "clinicategory", "category"]);
      const contactNumber = normalizeContactNumber(
        getCell(row, ["contactnumber", "contactno", "contact"])
      );
      const whatsapp = normalizeContactNumber(getCell(row, ["whatsapp"]));

      if (!clinicName || !categoryName || !contactNumber || !whatsapp) {
        skipped.push({
          row: rowNumber,
          reason: "Clinic name, category, contact number and WhatsApp number are required",
        });
        continue;
      }

      const categoryId = categoryIdByName.get(categoryName.trim().toLowerCase());
      if (!categoryId) {
        skipped.push({ row: rowNumber, reason: `Unknown clinic category: ${categoryName}` });
        continue;
      }

      const address = getCell(row, ["address"]);
      const mapLink = getCell(row, ["maplink", "map"]);
      const location = extractLatLngFromMapLink(mapLink);
      const clinicAddresses = buildClinicAddressesFromRequest(
        {},
        address,
        clinicName,
        contactNumber
      );
      const addressText =
        clinicAddresses[0]?.address || formatClinicAddressText(clinicAddresses[0]) || address;

      const workingOpenTime = getCell(row, ["workingopentime", "opentime"]);
      const workingCloseTime = getCell(row, ["workingclosetime", "closetime"]);
      const workingDaysRaw = getCell(row, ["workingdays", "days"]);
      const offDaysRaw = getCell(row, ["offdays"]);
      const workingHours = parseWorkingHours({
        openTime: workingOpenTime,
        closeTime: workingCloseTime,
        days: workingDaysRaw ? splitList(workingDaysRaw) : [],
        offDays: offDaysRaw ? splitList(offDaysRaw) : [],
      });

      const doctorsRaw = getCell(row, ["doctors"]);
      const doctors = doctorsRaw ? parseDoctorsCell(doctorsRaw) : [];

      const emailValue = getCell(row, ["email"]);

      const payload: Record<string, unknown> = {
        cuc: await generateNextClinicCuc(),
        clinicName,
        slug: await buildUniqueClinicSlug(clinicName),
        dermaCategory: categoryId,
        address: addressText,
        addresses: clinicAddresses,
        ...(emailValue ? { email: emailValue } : {}),
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        contactNumber,
        whatsapp,
        doctors,
        workingHours,
        clinicLogo: getCell(row, ["cliniclogo", "logo"]) || undefined,
        bannerImage: getCell(row, ["bannerimage", "banner"]) || undefined,
        rateCard: splitList(getCell(row, ["ratecard"])),
        specialOffers: splitList(getCell(row, ["specialoffers"])),
        photos: splitList(getCell(row, ["photos"])),
        certifications: splitList(getCell(row, ["certifications"])),
        video: getCell(row, ["video"]) || undefined,
        verifiedBadge: parseBoolean(getCell(row, ["verifiedbadge"]), false),
        isActive: parseBoolean(getCell(row, ["isactive"]), true),
        clinicType: getCell(row, ["clinictype"]) || undefined,
        ownerName: getCell(row, ["ownername"]) || undefined,
        website: getCell(row, ["website"]) || undefined,
        city: getCell(row, ["city"]) || undefined,
        services: getCell(row, ["services"]) || undefined,
        sector: getCell(row, ["sector"]) || undefined,
        pincode: getCell(row, ["pincode"]) || undefined,
        mapLink: mapLink || undefined,
        clinicDescription: getCell(row, ["clinicdescription", "description"]) || undefined,
        licenseNo: getCell(row, ["licenseno", "license"]) || undefined,
        experience: getCell(row, ["experience"]) || undefined,
        treatmentsAvailable: getCell(row, ["treatmentsavailable"]) || undefined,
        availableServices: getCell(row, ["availableservices"]) || undefined,
        consultationFee: getCell(row, ["consultationfee"]) || undefined,
        bookingMode: getCell(row, ["bookingmode"]) || undefined,
        instagram: getCell(row, ["instagram"]) || undefined,
        linkedin: getCell(row, ["linkedin"]) || undefined,
        facebook: getCell(row, ["facebook"]) || undefined,
        standardPlanLink: getCell(row, ["standardplanlink"]) || undefined,
        clinicStatus: getCell(row, ["clinicstatus"]) || "Open",
      };

      try {
        const clinic = await Clinic.create(payload);
        created.push(clinic);
      } catch (err: any) {
        let reason = err.message || "Failed to create clinic";
        if (err?.code === 11000) {
          const field = Object.keys(err.keyValue || {})[0] || "field";
          reason = `A clinic with this ${field} already exists (${err.keyValue?.[field]}).`;
        }
        skipped.push({ row: rowNumber, reason });
      }
    }

    if (!created.length) {
      return res.status(400).json({
        message: "No valid clinics found in uploaded file",
        skipped,
      });
    }

    res.status(201).json({
      message: `${created.length} clinics uploaded successfully`,
      createdCount: created.length,
      skipped,
    });
  } catch (err: any) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: err.message || "Bulk upload failed" });
  }
});

/* ================= GET ALL CLINICS ================= */

/* ================= NEARBY CLINICS ================= */


router.get(
"/nearby",
async(
req:Request,
res:Response
)=>{


try{


const {
lat,
lng
}=req.query;



if(!lat || !lng){

return res.status(400).json({

message:"Location required"

});

}



const clinics =
await Clinic.find({

isActive:{
$ne:false
},


latitude:{
$ne:null
},


longitude:{
$ne:null
}


})
.populate(
"dermaCategory",
"name"
);




const nearby =
clinics.filter(
(clinic:any)=>{


const distance =
calculateDistanceKm(

Number(lat),

Number(lng),

clinic.latitude,

clinic.longitude

);



return distance <= 15;


});



return res.json(
nearby
);



}
catch(error:any){


return res.status(500).json({

message:
"Nearby clinic failed",

error:error.message

});


}


});

router.get("/", async (req, res) => {
  try {
    const lightMode = String(req.query.light || "").toLowerCase() === "true";
    if (lightMode) {
      const clinics = await Clinic.find()
        .select(
          "cuc clinicName slug clinicType ownerName website contactNumber whatsapp email dermaCategory address city services sector pincode mapLink clinicStatus verifiedBadge isActive doctors workingHours clinicLogo bannerImage rateCard specialOffers photos certifications video licenseNo experience treatmentsAvailable availableServices consultationFee bookingMode clinicDescription instagram linkedin facebook standardPlanLink latitude longitude gstNumber addresses approvalStatus rejectionReason approvedAt createdAt updatedAt"
        )
        .populate("dermaCategory", "name")
        .lean();

      return res.json(clinics.map(stripHeavyClinicFields));
    }

    const clinics = await Clinic.find({ isActive: { $ne: false } }).populate("dermaCategory", "name");
    for (const clinic of clinics) {
      await ensureClinicSlug(clinic);
    }

    res.json(clinics);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch clinics" });
  }
});

/* ================= GET SINGLE CLINIC ================= */
router.get("/:id", async (req, res) => {
  try {
    const identifier = req.params.id;
    let clinic = await Clinic.findOne({ slug: identifier }).populate(
      "dermaCategory",
      "name"
    );

    if (!clinic && mongoose.Types.ObjectId.isValid(identifier)) {
      clinic = await Clinic.findById(identifier).populate(
        "dermaCategory",
        "name"
      );
    }

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    await ensureClinicSlug(clinic);
    res.json(clinic);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch clinic" });
  }
});

/* ================= UPDATE CLINIC ================= */
router.put(
  "/:id",
  upload.fields([
    { name: "clinicLogo", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
    { name: "rateCard", maxCount: 1 },
    { name: "specialOffers", maxCount: 5 },
    { name: "photos", maxCount: 10 },
    { name: "certifications", maxCount: 5 },
  ]),
  async (req, res) => {
  try {
    const existingClinic = await Clinic.findById(req.params.id);
    if (!existingClinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    const files = req.files as
      | {
          [fieldname: string]: Express.Multer.File[];
        }
      | undefined;

    const nextClinicName =
      typeof req.body?.clinicName === "string" && req.body.clinicName.trim()
        ? req.body.clinicName.trim()
        : existingClinic.clinicName;

    const nextSlug = await buildUniqueClinicSlug(
      nextClinicName,
      existingClinic._id.toString()
    );

    const uploadedClinicLogo = getUploadedPaths(files?.clinicLogo);
    const uploadedBannerImage = getUploadedPaths(files?.bannerImage);
    const uploadedRateCard = getUploadedPaths(files?.rateCard);
    const uploadedSpecialOffers = getUploadedPaths(files?.specialOffers);
    const uploadedPhotos = getUploadedPaths(files?.photos);
    const uploadedCertifications = getUploadedPaths(files?.certifications);
    const normalizedContactNumber =
      normalizeContactNumber(req.body?.contactNumber) ||
      normalizeContactNumber(req.body?.contactNo);
    const parsedDoctors =
      typeof req.body?.doctors !== "undefined"
        ? normalizeDoctors(req.body.doctors)
        : existingClinic.doctors;
    const parsedRateCard = parseStringArray(req.body?.rateCard);
    const parsedSpecialOffers = parseStringArray(req.body?.specialOffers);
    const parsedPhotos = parseStringArray(req.body?.photos);
    const parsedCertifications = parseStringArray(req.body?.certifications);
    const parsedRateCardMerged = [
      ...(hasOwn(req.body, "rateCard") ? parsedRateCard : []),
      ...uploadedRateCard,
    ];
    const parsedSpecialOffersMerged = [
      ...(hasOwn(req.body, "specialOffers") ? parsedSpecialOffers : []),
      ...uploadedSpecialOffers,
    ];
    const parsedPhotosMerged = [
      ...(hasOwn(req.body, "photos") ? parsedPhotos : []),
      ...uploadedPhotos,
    ];
    const parsedCertificationsMerged = [
      ...(hasOwn(req.body, "certifications") ? parsedCertifications : []),
      ...uploadedCertifications,
    ];
    const hasAddressesField = hasOwn(req.body, "addresses");
    const parsedAddresses = parseClinicAddresses(req.body?.addresses);
    const nextAddresses = hasAddressesField
      ? mergeClinicAddresses([], parsedAddresses)
      : Array.isArray(existingClinic.addresses)
      ? mergeClinicAddresses([], existingClinic.addresses)
      : String(req.body?.address || "").trim()
      ? [
          buildClinicAddressFromText(String(req.body?.address || "").trim(), {
            type: "Clinic",
            fullName: nextClinicName,
            mobileNo: normalizedContactNumber || existingClinic.contactNumber || "",
          }),
        ]
      : [];
    const nextAddressText = hasAddressesField
      ? String(req.body?.address || "").trim() ||
        formatClinicAddressText(nextAddresses[0]) ||
        ""
      : String(req.body?.address || "").trim() || existingClinic.address || "";
    const updateLocation = extractLatLngFromMapLink(req.body.mapLink);

    const updated = await Clinic.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        address: nextAddressText,
        ...(hasAddressesField || nextAddresses.length
          ? { addresses: nextAddresses }
          : {}),
        ...(normalizedContactNumber ? { contactNumber: normalizedContactNumber } : {}),
        ...(hasOwn(req.body, "workingHours")
          ? { workingHours: parseWorkingHours(req.body.workingHours) }
          : {}),
        ...(hasOwn(req.body, "verifiedBadge")
          ? { verifiedBadge: parseBoolean(req.body.verifiedBadge, false) }
          : {}),
        ...(hasOwn(req.body, "isActive")
          ? { isActive: parseBoolean(req.body.isActive, true) }
          : {}),
        // mapLink drives latitude/longitude — only overwrite them when a
        // coordinate pair was actually extracted from the submitted link.
        ...(updateLocation
          ? { latitude: updateLocation.latitude, longitude: updateLocation.longitude }
          : {}),
        slug: nextSlug,
        doctors: parsedDoctors,
        ...(uploadedClinicLogo.length ? { clinicLogo: uploadedClinicLogo[0] } : {}),
        ...(uploadedBannerImage.length ? { bannerImage: uploadedBannerImage[0] } : {}),
        ...(hasOwn(req.body, "rateCard") || uploadedRateCard.length
          ? { rateCard: parsedRateCardMerged }
          : {}),
        ...(hasOwn(req.body, "specialOffers") || uploadedSpecialOffers.length
          ? { specialOffers: parsedSpecialOffersMerged }
          : {}),
        ...(hasOwn(req.body, "photos") || uploadedPhotos.length
          ? { photos: parsedPhotosMerged }
          : {}),
        ...(hasOwn(req.body, "certifications") || uploadedCertifications.length
          ? { certifications: parsedCertificationsMerged }
          : {}),
      },
      { new: true }
    ).populate("dermaCategory", "name");

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update clinic" });
  }
  }
);

/* ================= APPROVE CLINIC REGISTRATION ================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);
    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    clinic.approvalStatus = "approved";
    clinic.rejectionReason = "";
    clinic.approvedAt = new Date();
    await clinic.save();

    // If this clinic came from a B2B user's "Become a Clinic" conversion,
    // this is the point where that's finalized: their order history moves
    // over to the clinic account, and the B2BUser record is removed so
    // future logins resolve to the clinic instead.
    if (clinic.convertedFromB2BUserId) {
      await Order.updateMany(
        { b2bUserId: clinic.convertedFromB2BUserId },
        { $set: { ownerType: "clinic", clinicId: clinic._id } }
      );
      await B2BUser.findByIdAndDelete(clinic.convertedFromB2BUserId);
    }

    if (clinic.email) {
      sendMail(
        clinic.email,
        "Your clinic registration has been approved",
        `Good news! Your clinic "${clinic.clinicName}" has been approved by the Dr Dermat admin team. You can now log in and access your clinic dashboard.`
      ).catch((err) => console.error("Failed to send approval email:", err));
    }

    res.json({ message: "Clinic approved successfully", clinic });
  } catch (err) {
    res.status(500).json({ message: "Failed to approve clinic" });
  }
});

/* ================= REJECT CLINIC REGISTRATION ================= */
router.patch("/:id/reject", async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);
    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    const reason = String(req.body?.reason ?? "").trim();

    clinic.approvalStatus = "rejected";
    clinic.rejectionReason = reason;
    clinic.approvedAt = undefined;
    await clinic.save();

    // If this was a B2B user's conversion attempt, clear their pending
    // marker so they keep using their B2B account and can try again later.
    if (clinic.convertedFromB2BUserId) {
      await B2BUser.findByIdAndUpdate(clinic.convertedFromB2BUserId, {
        $unset: { pendingClinicId: "" },
      });
    }

    if (clinic.email) {
      sendMail(
        clinic.email,
        "Your clinic registration was not approved",
        `We're sorry, your clinic "${clinic.clinicName}" registration was not approved by the Dr Dermat admin team.${
          reason ? ` Reason: ${reason}.` : ""
        } If you have questions, please contact support.`
      ).catch((err) => console.error("Failed to send rejection email:", err));
    }

    res.json({ message: "Clinic rejected", clinic });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject clinic" });
  }
});

/* ================= DELETE CLINIC ================= */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Clinic.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Clinic not found" });
    }
    res.json({ message: "Clinic deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete clinic" });
  }
});

export default router;