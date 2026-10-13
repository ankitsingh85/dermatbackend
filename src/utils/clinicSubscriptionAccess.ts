import ClinicSubscription from "../models/clinicSubscription";

export type SubscriptionOverride = "auto" | "enabled" | "disabled";

/** "auto" defers to whether the clinic has an active subscription;
 * "enabled"/"disabled" let admin force a perk on/off regardless. Shared by
 * the WhatsApp button, Lead dashboard access, and the verified badge. */
export const resolveOverride = (
  override: SubscriptionOverride | undefined,
  hasActiveSubscription: boolean
): boolean => {
  if (override === "enabled") return true;
  if (override === "disabled") return false;
  return hasActiveSubscription;
};

export const getActiveSubscriptionClinicIds = async (clinicIds: string[]) => {
  if (clinicIds.length === 0) return new Set<string>();
  const activeSubs = await ClinicSubscription.find({
    clinicId: { $in: clinicIds },
    status: "active",
    endDate: { $gte: new Date() },
  }).select("clinicId");
  return new Set(activeSubs.map((sub) => String(sub.clinicId)));
};
