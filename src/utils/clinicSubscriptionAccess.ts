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

export type ActiveSubscriptionDetail = { hasAddons: boolean };

/** Same "active subscription" lookup as getActiveSubscriptionClinicIds, but
 * also reports whether each clinic's current plan includes add-ons — used
 * to rank the Find Clinics page: plan + add-ons > plan only > no plan. */
export const getActiveSubscriptionDetails = async (
  clinicIds: string[]
): Promise<Map<string, ActiveSubscriptionDetail>> => {
  const map = new Map<string, ActiveSubscriptionDetail>();
  if (clinicIds.length === 0) return map;

  const activeSubs = await ClinicSubscription.find({
    clinicId: { $in: clinicIds },
    status: "active",
    endDate: { $gte: new Date() },
  }).select("clinicId addons");

  activeSubs.forEach((sub) => {
    map.set(String(sub.clinicId), { hasAddons: (sub.addons || []).length > 0 });
  });

  return map;
};
