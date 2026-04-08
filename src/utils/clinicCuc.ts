import Clinic from "../models/clinic";
import ClinicSequence from "../models/clinicSequence";

const CLINIC_CUC_COUNTER = "clinicCuc";

const formatClinicCuc = (seq: number) => `CUC${String(seq).padStart(4, "0")}`;

const getHighestExistingClinicCuc = async () => {
  const clinics = await Clinic.find({
    cuc: { $regex: /^CUC\d+$/ },
  })
    .select("cuc")
    .lean();

  let highest = 0;

  for (const clinic of clinics) {
    const match = /^CUC(\d+)$/.exec(String(clinic.cuc || ""));
    if (!match) continue;

    highest = Math.max(highest, Number(match[1] || 0));
  }

  return highest;
};

const ensureClinicCounterSeeded = async () => {
  const existingCounter = await ClinicSequence.findOne({
    name: CLINIC_CUC_COUNTER,
  }).lean();

  if (existingCounter) return;

  const seed = await getHighestExistingClinicCuc();
  await ClinicSequence.findOneAndUpdate(
    { name: CLINIC_CUC_COUNTER },
    { $setOnInsert: { name: CLINIC_CUC_COUNTER, seq: seed } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const generateNextClinicCuc = async () => {
  await ensureClinicCounterSeeded();

  const counter = await ClinicSequence.findOneAndUpdate(
    { name: CLINIC_CUC_COUNTER },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!counter) {
    throw new Error("Failed to generate clinic CUC");
  }

  return formatClinicCuc(counter.seq);
};
