import express, { Request, Response } from "express";
import B2BUser from "../models/B2BUser";
import { convertB2BUserToClinic } from "../controllers/B2BConversionController";

const router = express.Router();

const contactRegex = /^\d{10}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pincodeRegex = /^\d{6}$/;
const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const cleanString = (value: unknown) => String(value ?? "").trim();

export const generateB2BUserId = async () => {
  const now = new Date();
  const prefix = `B2BUser-${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;

  const lastUser = await B2BUser.findOne({
    b2bUserId: { $regex: `^${prefix}` },
  }).sort({ createdAt: -1 });

  const lastCount = Number(lastUser?.b2bUserId?.split("-")[2] || 0);
  const nextCount = Number.isNaN(lastCount) ? 1 : lastCount + 1;
  return `${prefix}-${nextCount}`;
};

const buildB2BUserPayload = (body: Record<string, unknown>) => {
  const payload = {
    name: cleanString(body.name),
    contactPerson: cleanString(body.contactPerson),
    email: cleanString(body.email).toLowerCase(),
    contactNo: cleanString(body.contactNo),
    gstNumber: cleanString(body.gstNumber).toUpperCase(),
    address: cleanString(body.address),
    city: cleanString(body.city),
    state: cleanString(body.state),
    pincode: cleanString(body.pincode),
    status: cleanString(body.status) === "inactive" ? "inactive" : "active",
  };

  return payload;
};

const validateB2BUserPayload = (
  payload: ReturnType<typeof buildB2BUserPayload>,
  partial = false
) => {
  if (!partial || payload.name) {
    if (!payload.name) return "Name is required";
  }

  if (!partial || payload.contactNo) {
    if (!payload.contactNo) return "Contact number is required";
    if (!contactRegex.test(payload.contactNo)) {
      return "Contact number must contain exactly 10 digits";
    }
  }

  if (payload.email && !emailRegex.test(payload.email)) {
    return "Enter a valid email address";
  }

  if (payload.pincode && !pincodeRegex.test(payload.pincode)) {
    return "Pincode must contain exactly 6 digits";
  }

  if (payload.gstNumber && !gstRegex.test(payload.gstNumber)) {
    return "Enter a valid GST number";
  }

  return "";
};

router.post("/", async (req: Request, res: Response) => {
  try {
    const payload = buildB2BUserPayload(req.body);
    const validationError = validateB2BUserPayload(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const duplicateConditions: Record<string, unknown>[] = [
      { contactNo: payload.contactNo },
    ];
    if (payload.email) duplicateConditions.push({ email: payload.email });
    if (payload.gstNumber) duplicateConditions.push({ gstNumber: payload.gstNumber });

    const exists = await B2BUser.findOne({ $or: duplicateConditions });
    if (exists) {
      return res.status(400).json({
        message: "B2B user with same email, contact number or GST already exists",
      });
    }

    const { email, ...requiredPayload } = payload;
    const user = await B2BUser.create({
      ...requiredPayload,
      // The admin "Create B2B User" form no longer collects a separate
      // contact person — default it to the business name, same as the
      // self-registration signup flow does.
      contactPerson: requiredPayload.contactPerson || requiredPayload.name,
      ...(email ? { email } : {}),
      b2bUserId: await generateB2BUserId(),
    });

    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create B2B user" });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const users = await B2BUser.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch B2B users" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const user = await B2BUser.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "B2B user not found" });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch B2B user" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const payload = buildB2BUserPayload(req.body);
    const validationError = validateB2BUserPayload(payload, true);
    if (validationError) return res.status(400).json({ message: validationError });

    const updateData = Object.entries(payload).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (value !== "") acc[key] = value;
        if (
          ["email", "gstNumber", "address", "city", "state", "pincode"].includes(
            key
          )
        ) {
          acc[key] = value;
        }
        return acc;
      },
      {}
    );

    const unsetData: Record<string, string> = {};
    ["email", "gstNumber", "address", "city", "state", "pincode"].forEach(
      (key) => {
        if (updateData[key] === "") {
          unsetData[key] = "";
          delete updateData[key];
        }
      }
    );

    const updateOperation =
      Object.keys(unsetData).length > 0
        ? { $set: updateData, $unset: unsetData }
        : { $set: updateData };

    const updated = await B2BUser.findByIdAndUpdate(
      req.params.id,
      updateOperation,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updated) return res.status(404).json({ message: "B2B user not found" });
    res.json(updated);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Duplicate B2B user value found" });
    }
    res.status(500).json({ message: error.message || "Failed to update B2B user" });
  }
});

router.post("/:id/convert-to-clinic", convertB2BUserToClinic);

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await B2BUser.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "B2B user not found" });
    res.json({ message: "B2B user deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete B2B user" });
  }
});

export default router;
