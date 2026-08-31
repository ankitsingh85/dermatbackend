import { Request, Response } from "express";
import B2BUser from "../models/B2BUser";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import { buildClinicAddressFromText } from "../utils/clinicAddresses";
import { generateNextClinicCuc } from "../utils/clinicCuc";
import { buildUniqueClinicSlug, findClinicByContactNo } from "./ClinicAuthController";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// A B2B user chose to "Become a Clinic": submits business name, address,
// email and GST number, and a new (pending-approval) Clinic record is
// created from them. The B2BUser record is intentionally NOT deleted and
// NOT touched otherwise here — they keep using their B2B account exactly
// as before until an admin approves the clinic (see clinicRoutes.ts's
// /approve route, which deletes the B2BUser at that point and only then
// moves their order history over). If the admin rejects it instead, the
// B2BUser's pendingClinicId is cleared so they can try again later (see
// the /reject route).
export const convertB2BUserToClinic = async (req: Request, res: Response) => {
  try {
    const b2bUser = await B2BUser.findById(req.params.id);
    if (!b2bUser) {
      return res.status(404).json({ message: "B2B user not found" });
    }

    if (b2bUser.pendingClinicId) {
      const pending = await Clinic.findById(b2bUser.pendingClinicId);
      if (pending && pending.approvalStatus === "pending") {
        return res.status(400).json({
          message: "You already have a clinic application pending admin approval.",
        });
      }
    }

    const existingClinic = await findClinicByContactNo(b2bUser.contactNo);
    if (existingClinic) {
      return res.status(400).json({
        message: "A clinic already exists for this contact number",
      });
    }

    const clinicName = String(req.body?.name ?? b2bUser.name ?? "").trim();
    const address = String(req.body?.address ?? b2bUser.address ?? "").trim();
    const email = String(req.body?.email ?? b2bUser.email ?? "").trim().toLowerCase();
    const gstNumber = String(req.body?.gstNumber ?? b2bUser.gstNumber ?? "")
      .trim()
      .toUpperCase();

    if (!clinicName || !address) {
      return res.status(400).json({ message: "Business name and address are required" });
    }

    if (email && !emailRegex.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (gstNumber && !gstRegex.test(gstNumber)) {
      return res.status(400).json({ message: "Enter a valid GST number" });
    }

    if (email) {
      const existingByEmail = await Clinic.findOne({ email });
      if (existingByEmail) {
        return res.status(400).json({
          message: "Email already registered with another clinic",
        });
      }
    }

    const category = (await ClinicCategory.findOne().sort({ createdAt: 1 }))?._id;
    if (!category) {
      return res.status(400).json({
        message: "No clinic category available. Please create one first.",
      });
    }

    const clinic = await Clinic.create({
      cuc: await generateNextClinicCuc(),
      clinicName,
      slug: await buildUniqueClinicSlug(clinicName),
      dermaCategory: category,
      address,
      addresses: [
        buildClinicAddressFromText(address, {
          type: "Clinic",
          fullName: clinicName,
          mobileNo: b2bUser.contactNo,
          state: b2bUser.state,
          pincode: b2bUser.pincode,
        }),
      ],
      city: b2bUser.city || undefined,
      pincode: b2bUser.pincode || undefined,
      email: email || undefined,
      gstNumber: gstNumber || undefined,
      contactNumber: b2bUser.contactNo,
      ownerName: b2bUser.contactPerson || undefined,
      clinicStatus: "Open",
      // Converted accounts go through the same admin-approval gate as any
      // other clinic self-registration.
      approvalStatus: "pending",
      convertedFromB2BUserId: b2bUser._id,
    });

    b2bUser.pendingClinicId = clinic._id as any;
    await b2bUser.save();

    return res.status(200).json({
      message:
        "Your clinic application has been submitted for admin approval. You can keep using your B2B account until it's reviewed.",
      pendingApproval: true,
      clinicId: clinic._id,
    });
  } catch (err: any) {
    console.error("Convert B2B user to clinic error:", err);
    return res.status(500).json({
      message: err.message || "Failed to convert to clinic",
    });
  }
};
