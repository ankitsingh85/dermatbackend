import Clinic from "../models/clinic";
import Doctor from "../models/doctor";
import B2BUser from "../models/B2BUser";

export type RequesterType = "clinic" | "doctor" | "b2buser";

export const resolveRequesterProfile = async (requesterType: RequesterType, requesterId: string) => {
  if (requesterType === "clinic") {
    const clinic = await Clinic.findById(requesterId).select("clinicName email contactNumber");
    if (!clinic) return null;
    return {
      name: clinic.clinicName || "Clinic",
      email: clinic.email || "",
      phone: clinic.contactNumber || "",
    };
  }

  if (requesterType === "doctor") {
    const doctor = await Doctor.findById(requesterId).select("title firstName lastName email phone");
    if (!doctor) return null;
    return {
      name:
        [doctor.title || "Dr.", doctor.firstName, doctor.lastName].filter(Boolean).join(" ") ||
        "Doctor",
      email: doctor.email || "",
      phone: doctor.phone || "",
    };
  }

  const b2bUser = await B2BUser.findById(requesterId).select("name email contactNo");
  if (!b2bUser) return null;
  return {
    name: b2bUser.name || "B2B User",
    email: b2bUser.email || "",
    phone: b2bUser.contactNo || "",
  };
};
