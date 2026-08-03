import { Request, Response } from "express";
import B2BUser from "../models/B2BUser";
import Clinic from "../models/clinic";
import ClinicCategory from "../models/clinicCategory";
import Order from "../models/order";
import { buildClinicAddressFromText } from "../utils/clinicAddresses";
import { generateNextClinicCuc } from "../utils/clinicCuc";
import { buildUniqueClinicSlug, findClinicByContactNo } from "./ClinicAuthController";

// A B2B user chose to "Become a Clinic": their B2BUser record is converted
// into a full Clinic record (same admin-approval gate as any other clinic
// self-registration) and the B2BUser record is deleted entirely — the
// account now exists only as a (pending) Clinic.
export const convertB2BUserToClinic = async (req: Request, res: Response) => {
  try {
    const b2bUser = await B2BUser.findById(req.params.id);
    if (!b2bUser) {
      return res.status(404).json({ message: "B2B user not found" });
    }

    const existingClinic = await findClinicByContactNo(b2bUser.contactNo);
    if (existingClinic) {
      return res.status(400).json({
        message: "A clinic already exists for this contact number",
      });
    }

    const category = (await ClinicCategory.findOne().sort({ createdAt: 1 }))?._id;
    if (!category) {
      return res.status(400).json({
        message: "No clinic category available. Please create one first.",
      });
    }

    const clinic = await Clinic.create({
      cuc: await generateNextClinicCuc(),
      clinicName: b2bUser.name,
      slug: await buildUniqueClinicSlug(b2bUser.name),
      dermaCategory: category,
      address: b2bUser.address || "",
      addresses: [
        buildClinicAddressFromText(b2bUser.address || "", {
          type: "Clinic",
          fullName: b2bUser.name,
          mobileNo: b2bUser.contactNo,
          state: b2bUser.state,
          pincode: b2bUser.pincode,
        }),
      ],
      city: b2bUser.city || undefined,
      pincode: b2bUser.pincode || undefined,
      email: b2bUser.email || undefined,
      contactNumber: b2bUser.contactNo,
      ownerName: b2bUser.contactPerson || undefined,
      clinicStatus: "Open",
      // Converted accounts go through the same admin-approval gate as any
      // other clinic self-registration.
      approvalStatus: "pending",
    });

    // Carry the B2B user's order history over to the new clinic — the
    // same order documents now belong to the clinic account, so they show
    // up in the clinic's order history too.
    await Order.updateMany(
      { b2bUserId: b2bUser._id },
      { $set: { ownerType: "clinic", clinicId: clinic._id } }
    );

    await B2BUser.findByIdAndDelete(b2bUser._id);

    return res.status(200).json({
      message:
        "Your account has been converted to a clinic and submitted for admin approval. You'll be able to log in as a clinic once it's reviewed.",
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
