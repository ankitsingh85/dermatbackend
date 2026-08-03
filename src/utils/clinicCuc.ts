import Clinic from "../models/clinic";

/* ================= CUC GENERATOR =================
   Format: ClinicName-<YYYYMM>-<N>
   e.g. "ClinicName-202608-1", "ClinicName-202608-2", "ClinicName-202608-3" ...
   "ClinicName" is a fixed prefix (NOT based on the actual clinic's name).
   The sequence number increments dynamically per month, across all clinics.
   Shared by every clinic-creation path (admin "Create Clinic", clinic
   self-registration, and B2B-user-to-clinic conversion) so the format
   stays identical no matter how the clinic was created.
*/
const CUC_PREFIX_LABEL = "ClicName";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const generateNextClinicCuc = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const prefix = `${CUC_PREFIX_LABEL}-${year}${month}-`;
  const escapedPrefix = escapeRegExp(prefix);

  const existing = await Clinic.find({
    cuc: { $regex: `^${escapedPrefix}\\d+$` },
  }).select("cuc");

  let maxSeq = 0;
  const seqRegex = new RegExp(`^${escapedPrefix}(\\d+)$`);

  for (const clinic of existing) {
    const match = clinic.cuc?.match(seqRegex);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return `${prefix}${maxSeq + 1}`;
};
