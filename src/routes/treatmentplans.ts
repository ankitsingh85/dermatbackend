import express from "express";
import mongoose from "mongoose";
import upload from "../middleware/uploads";
import Clinic from "../models/clinic";
import TreatmentPlan from "../models/treatmentplans";

const router = express.Router();

const textOnlyRegex = /^[A-Za-z ]+$/;
const digitsOnlyRegex = /^\d+$/;
const isValidUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};
const generateTreatmentCode = async()=>{

const now = new Date();

const year =
now.getFullYear();

const month =
String(now.getMonth()+1)
.padStart(2,"0");


const prefix =
`TrmntPkg-${year}${month}`;



const last =
await TreatmentPlan
.findOne({
tuc:{
$regex:`^${prefix}`
}
})
.sort({
createdAt:-1
});



let count = 1;


if(last?.tuc){

const lastNumber =
Number(
last.tuc.split("-")[2]
);

count =
lastNumber + 1;

}


return `${prefix}-${count}`;

};
const stripHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const friendlyNumericFieldNames: Record<string, string> = {
  mrp: "MRP",
  offerPrice: "Offer price",
  discountPercent: "Discount percent",
  sessions: "No. of sessions",
};

const slugifyTreatmentName = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "treatment-plan-details";
};

const buildUniqueTreatmentSlug = async (
  treatmentName: string,
  excludeId?: string
) => {
  const baseSlug = slugifyTreatmentName(treatmentName);
  let slug = baseSlug;
  let counter = 2;

  while (
    await TreatmentPlan.findOne({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
};

const ensureTreatmentSlug = async (plan: any) => {
  if (!plan) return plan;
  if (plan.slug) return plan;

  plan.slug = await buildUniqueTreatmentSlug(
    plan.treatmentName || "treatment-plan-details",
    plan._id?.toString()
  );
  await plan.save();
  return plan;
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

const parseUploadedStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === "string" &&
        !/^data:/i.test(item.trim()) &&
        !/^blob:/i.test(item.trim())
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string =>
            typeof item === "string" &&
            !/^data:/i.test(item.trim()) &&
            !/^blob:/i.test(item.trim())
        );
      }
    } catch {
      return [];
    }
  }
  return [];
};

const getUploadedPaths = (files: Express.Multer.File[] | undefined): string[] => {
  if (!files || files.length === 0) return [];
  return files.map((file) => `/uploads/${file.filename}`);
};

router.post(
  "/",
  upload.fields([
    { name: "treatmentImages", maxCount: 20 },
    { name: "beforeImages", maxCount: 20 },
    { name: "afterImages", maxCount: 20 },
    { name: "categoryIcons", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as
        | {
            [fieldname: string]: Express.Multer.File[];
          }
        | undefined;

      const {
     
        treatmentName,
        slug: incomingSlug,
        clinic,
        description,
        shortReelUrl,
        serviceCategory,
        mrp,
        offerPrice,
        pricePerSession,
        discountPercent,
        sessions,
        duration,
        validity,
        technologyUsed,
        gender,
        promoCode,
        addToCart,
        isActive,
      } = req.body;

      const cleanTreatmentName = String(treatmentName ?? "").trim();
      const cleanServiceCategory = String(serviceCategory ?? "").trim();
      const cleanShortReelUrl = String(shortReelUrl ?? "").trim();
      const rawBody = req.body as Record<string, unknown>;

      // Only treatmentName, serviceCategory and offerPrice are mandatory —
      // everything else (clinic, description, images, reel URL, other
      // pricing/detail fields) is optional.
      if (!cleanTreatmentName) {
        return res
          .status(400)
          .json({ message: "Treatment plan name is required" });
      }

      if (!textOnlyRegex.test(cleanTreatmentName)) {
        return res.status(400).json({
          message: "Treatment plan name should contain only letters and spaces",
        });
      }

      if (!cleanServiceCategory) {
        return res.status(400).json({
          message: "Treatment category is required",
        });
      }

      if (cleanShortReelUrl && !isValidUrl(cleanShortReelUrl)) {
        return res.status(400).json({
          message: "Treatment short reel must be a valid URL",
        });
      }

      const clinicsArray =
        clinic === undefined || clinic === null || clinic === ""
          ? []
          : Array.isArray(clinic)
          ? clinic
          : JSON.parse(clinic);


for(const id of clinicsArray){

if(!mongoose.isValidObjectId(id)){

return res.status(400).json({
message:"Invalid clinic id"
});

}

}

const clinicCount =
await Clinic.countDocuments({
  _id:{
    $in: clinicsArray
  }
});


if(clinicCount !== clinicsArray.length){

 return res.status(400).json({
   message:"Some clinics are invalid"
 });

}

      const offerPriceValue = rawBody.offerPrice;
      if (
        offerPriceValue === undefined ||
        offerPriceValue === null ||
        offerPriceValue === ""
      ) {
        return res.status(400).json({
          message: `${friendlyNumericFieldNames.offerPrice} is required`,
        });
      }

      const numericFields: Array<keyof typeof rawBody> = [
        "mrp",
        "offerPrice",
        "discountPercent",
        "sessions",
      ];
      for (const field of numericFields) {
        const value = rawBody[field];
        if (value === undefined || value === null || value === "") continue;
        if (!digitsOnlyRegex.test(String(value))) {
          return res
            .status(400)
            .json({
              message: `${
                friendlyNumericFieldNames[String(field)] || String(field)
              } must contain digits only`,
            });
        }
      }

      if (
        rawBody.pricePerSession !== undefined &&
        rawBody.pricePerSession !== "" &&
        Number.isNaN(Number(rawBody.pricePerSession))
      ) {
        return res.status(400).json({
          message: "pricePerSession must be a valid number",
        });
      }

      const treatmentImages = getUploadedPaths(files?.treatmentImages).length
        ? getUploadedPaths(files?.treatmentImages)
        : parseUploadedStringArray(req.body.treatmentImages);

      const slug =
        typeof incomingSlug === "string" && incomingSlug.trim()
          ? incomingSlug.trim()
          : await buildUniqueTreatmentSlug(cleanTreatmentName);
const tuc =
await generateTreatmentCode();
      const created = await TreatmentPlan.create({
        tuc,
        treatmentName: cleanTreatmentName,
        slug,
     clinic: clinicsArray,
        description,
        shortReelUrl: cleanShortReelUrl,
      serviceCategory:
JSON.parse(serviceCategory),
        mrp: parseNumber(mrp),
        offerPrice: parseNumber(offerPrice),
        pricePerSession: parseNumber(pricePerSession),
        discountPercent: parseNumber(discountPercent),
        sessions:
          sessions !== undefined && sessions !== null && sessions !== ""
            ? String(sessions).trim()
            : undefined,
        duration,
        validity,
        technologyUsed,
        gender,
        promoCode,
        addToCart: parseBoolean(addToCart, true),
        isActive: parseBoolean(isActive, true),
        treatmentImages,
        beforeImages:
          getUploadedPaths(files?.beforeImages).length > 0
            ? getUploadedPaths(files?.beforeImages)
            : parseUploadedStringArray(req.body.beforeImages),
        afterImages:
          getUploadedPaths(files?.afterImages).length > 0
            ? getUploadedPaths(files?.afterImages)
            : parseUploadedStringArray(req.body.afterImages),
        categoryIcons:
          getUploadedPaths(files?.categoryIcons).length > 0
            ? getUploadedPaths(files?.categoryIcons)
            : parseUploadedStringArray(req.body.categoryIcons),
      });

      const populated = await TreatmentPlan.findById(created._id).populate(
        "clinic",
        "clinicName email address city sector pincode latitude longitude mapLink verifiedBadge slug"
      );

      return res.status(201).json(populated);
    } catch (error: any) {
      console.error("Create treatment plan error:", error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "Treatment unique code already exists. Please try again.",
        });
      }
      return res.status(500).json({
        message: "Failed to create treatment plan",
        error: error.message,
      });
    }
  }
);

router.get("/", async (req, res) => {
  try {
    const includeInactive =
      String(req.query.includeInactive || "").toLowerCase() === "true";
    const plans = await TreatmentPlan.find(
      includeInactive ? {} : { isActive: { $ne: false } }
    )
      .populate("clinic", "clinicName email address city sector pincode latitude longitude mapLink verifiedBadge slug")
      .sort({ createdAt: -1 });

    for (const plan of plans as any[]) {
      await ensureTreatmentSlug(plan);
    }

    return res.json(plans);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch treatment plans" });
  }
});

router.get("/:identifier", async (req, res) => {
  try {
    const identifier = req.params.identifier;
    const includeInactive =
      String(req.query.includeInactive || "").toLowerCase() === "true";
    const visibilityFilter = includeInactive ? {} : { isActive: { $ne: false } };

    const clinicPopulateFields =
      "clinicName email address city sector pincode latitude longitude mapLink verifiedBadge slug";

    let plan = await TreatmentPlan.findOne({
      slug: identifier,
      ...visibilityFilter,
    }).populate("clinic", clinicPopulateFields);

    if (!plan && mongoose.isValidObjectId(identifier)) {
      plan = await TreatmentPlan.findOne({
        _id: identifier,
        ...visibilityFilter,
      }).populate("clinic", clinicPopulateFields);
    }

    if (!plan) {
      const plans = await TreatmentPlan.find(visibilityFilter)
        .populate("clinic", "clinicName email address city sector pincode latitude longitude mapLink verifiedBadge slug")
        .sort({ createdAt: -1 });
      const matched = (plans as any[]).find(
        (item) =>
          slugifyTreatmentName(item.treatmentName || "") === identifier
      );
      plan = matched || null;
    }

    if (!plan) return res.status(404).json({ message: "Treatment plan not found" });
    return res.json(plan);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch treatment plan" });
  }
});

router.put(
  "/:id",
  upload.fields([
    { name: "treatmentImages", maxCount: 20 },
    { name: "beforeImages", maxCount: 20 },
    { name: "afterImages", maxCount: 20 },
    { name: "categoryIcons", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as
        | {
            [fieldname: string]: Express.Multer.File[];
          }
        | undefined;

      const payload: Record<string, unknown> = {
        ...req.body,
      };

      if (typeof payload.treatmentName === "string") {
        payload.slug = await buildUniqueTreatmentSlug(
          payload.treatmentName,
          req.params.id
        );
      }

      // FormData always sends this as a JSON-encoded string — parse it back
      // into a real array before it reaches Mongoose, same fix as clinic
      // below (otherwise it gets stored as one malformed string entry).
      if (typeof payload.serviceCategory === "string") {
        try {
          const parsedCategories = JSON.parse(payload.serviceCategory);
          if (!Array.isArray(parsedCategories)) {
            return res.status(400).json({ message: "Invalid service category data" });
          }
          payload.serviceCategory = parsedCategories.filter(
            (item: unknown): item is string => typeof item === "string" && item.trim().length > 0
          );
        } catch {
          return res.status(400).json({ message: "Invalid service category data" });
        }
      }

      if (payload.clinic) {
     let clinicsArray:string[] = [];


try {

 clinicsArray =
typeof payload.clinic === "string"
? JSON.parse(payload.clinic)
: payload.clinic as string[];


} catch {

 return res.status(400).json({
 message:"Invalid clinic data"
 });

}



if(
!Array.isArray(clinicsArray) ||
clinicsArray.length===0
){

return res.status(400).json({
message:"Please select clinic"
});

}



for(const id of clinicsArray){

if(!mongoose.isValidObjectId(id)){

return res.status(400).json({
message:"Invalid clinic id"
});

}

}



const clinicCount =
await Clinic.countDocuments({

_id:{
$in:clinicsArray
}

});



if(clinicCount !== clinicsArray.length){

return res.status(400).json({
message:"Some clinics are invalid"
});

}

// Write the parsed/validated array back — payload.clinic was still the
// raw JSON string at this point, which Mongoose can't cast to [ObjectId].
payload.clinic = clinicsArray;
      }

      if (payload.mrp !== undefined) payload.mrp = parseNumber(payload.mrp);
      if (payload.offerPrice !== undefined) {
        payload.offerPrice = parseNumber(payload.offerPrice);
      }
      if (payload.pricePerSession !== undefined) {
        payload.pricePerSession = parseNumber(payload.pricePerSession);
      }
      if (payload.discountPercent !== undefined) {
        payload.discountPercent = parseNumber(payload.discountPercent);
      }
      if (payload.addToCart !== undefined) {
        payload.addToCart = parseBoolean(payload.addToCart, true);
      }
      if (payload.isActive !== undefined) {
        payload.isActive = parseBoolean(payload.isActive, true);
      }

      const uploadedTreatmentImages = getUploadedPaths(files?.treatmentImages);
      const uploadedBeforeImages = getUploadedPaths(files?.beforeImages);
      const uploadedAfterImages = getUploadedPaths(files?.afterImages);
      const uploadedCategoryIcons = getUploadedPaths(files?.categoryIcons);

      if (uploadedTreatmentImages.length > 0) {
        payload.treatmentImages = uploadedTreatmentImages;
      } else if (payload.treatmentImages !== undefined) {
        payload.treatmentImages = parseUploadedStringArray(
          payload.treatmentImages
        );
      }

      if (uploadedBeforeImages.length > 0) {
        payload.beforeImages = uploadedBeforeImages;
      } else if (payload.beforeImages !== undefined) {
        payload.beforeImages = parseUploadedStringArray(payload.beforeImages);
      }

      if (uploadedAfterImages.length > 0) {
        payload.afterImages = uploadedAfterImages;
      } else if (payload.afterImages !== undefined) {
        payload.afterImages = parseUploadedStringArray(payload.afterImages);
      }

      if (uploadedCategoryIcons.length > 0) {
        payload.categoryIcons = uploadedCategoryIcons;
      } else if (payload.categoryIcons !== undefined) {
        payload.categoryIcons = parseUploadedStringArray(payload.categoryIcons);
      }

      const updated = await TreatmentPlan.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
      ).populate("clinic", "clinicName email address city sector pincode latitude longitude mapLink verifiedBadge slug");

      if (!updated) {
        return res.status(404).json({ message: "Treatment plan not found" });
      }

      return res.json(updated);
    } catch (error: any) {
      console.error("Update treatment plan error:", error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "Treatment unique code already exists. Please try again.",
        });
      }
      return res.status(500).json({
        message: "Failed to update treatment plan",
        error: error.message,
      });
    }
  }
);

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await TreatmentPlan.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Treatment plan not found" });
    }
    return res.json({ message: "Treatment plan deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete treatment plan" });
  }
});

export default router;
