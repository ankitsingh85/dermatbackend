export interface ClinicAddress {
  type?: string;
  address?: string;
  fullName?: string;
  mobileNo?: string;
  houseNo?: string;
  street?: string;
  localArea?: string;
  pincode?: string;
  district?: string;
  state?: string;
}

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeDigits = (value: unknown, maxLength: number) =>
  toText(value).replace(/\D/g, "").slice(0, maxLength);

export const sanitizeClinicAddressType = (value?: unknown) =>
  toText(value) || "Clinic";

export const formatClinicAddressText = (addr?: Partial<ClinicAddress> | null) => {
  if (!addr) return "";

  const parts = [
    addr.houseNo,
    addr.street,
    addr.localArea,
    addr.district,
    addr.state,
    addr.pincode,
  ]
    .map((part) => toText(part))
    .filter(Boolean);

  return parts.join(", ") || toText(addr.address);
};

export const buildClinicAddressFromText = (
  address: string,
  defaults: Partial<ClinicAddress> = {}
): ClinicAddress => ({
  type: sanitizeClinicAddressType(defaults.type),
  address: toText(address),
  fullName: toText(defaults.fullName),
  mobileNo: normalizeDigits(defaults.mobileNo, 10),
  houseNo: toText(defaults.houseNo),
  street: toText(defaults.street),
  localArea: toText(defaults.localArea),
  pincode: normalizeDigits(defaults.pincode, 6),
  district: toText(defaults.district),
  state: toText(defaults.state),
});

export const normalizeClinicAddress = (value: unknown): ClinicAddress => {
  if (typeof value === "string") {
    return buildClinicAddressFromText(value);
  }

  if (!value || typeof value !== "object") {
    return buildClinicAddressFromText("");
  }

  const input = value as Record<string, unknown>;
  const normalized: ClinicAddress = {
    type: sanitizeClinicAddressType(input.type),
    address: toText(input.address),
    fullName: toText(input.fullName),
    mobileNo: normalizeDigits(input.mobileNo, 10),
    houseNo: toText(input.houseNo),
    street: toText(input.street),
    localArea: toText(input.localArea),
    pincode: normalizeDigits(input.pincode, 6),
    district: toText(input.district),
    state: toText(input.state),
  };

  normalized.address = normalized.address || formatClinicAddressText(normalized);
  return normalized;
};

export const parseClinicAddresses = (value: unknown): ClinicAddress[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeClinicAddress(item))
      .filter((addr) => Boolean(formatClinicAddressText(addr) || addr.fullName || addr.mobileNo));
  }

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeClinicAddress(item))
        .filter((addr) => Boolean(formatClinicAddressText(addr) || addr.fullName || addr.mobileNo));
    }
  } catch {
    return [];
  }

  return [];
};

export const mergeClinicAddresses = (base: ClinicAddress[], next: ClinicAddress[]) => {
  const seen = new Set<string>();
  return [...base, ...next].filter((addr) => {
    const normalized = normalizeClinicAddress(addr);
    const key = [
      normalized.type,
      normalized.fullName,
      normalized.mobileNo,
      normalized.houseNo,
      normalized.street,
      normalized.localArea,
      normalized.pincode,
      normalized.district,
      normalized.state,
      normalized.address,
    ]
      .map((value) => toText(value).toLowerCase())
      .join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const cloneClinicAddresses = (addresses: ClinicAddress[] | undefined | null) =>
  mergeClinicAddresses([], addresses || []);
