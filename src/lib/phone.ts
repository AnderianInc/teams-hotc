import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js/min";

export type NormalizeResult = {
  e164: string | null;
  national: string | null;
  valid: boolean;
  reason?: string;
};

/**
 * Normalize a raw phone number into E.164 (+15558675310) for Twilio.
 * Defaults to US when no country code is detected.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = "US"
): NormalizeResult {
  if (!input || typeof input !== "string") {
    return { e164: null, national: null, valid: false, reason: "empty" };
  }
  const trimmed = input.trim();
  if (!trimmed) return { e164: null, national: null, valid: false, reason: "empty" };

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (!parsed) {
      return { e164: null, national: null, valid: false, reason: "unparseable" };
    }
    if (!parsed.isValid()) {
      return {
        e164: null,
        national: parsed.formatNational(),
        valid: false,
        reason: "invalid",
      };
    }
    return {
      e164: parsed.number,
      national: parsed.formatNational(),
      valid: true,
    };
  } catch {
    return { e164: null, national: null, valid: false, reason: "error" };
  }
}

/** Format a stored E.164 number for friendly display (e.g. "(415) 555-1212"). */
export function formatPhoneDisplay(
  e164: string | null | undefined,
  fallback: string = "—"
): string {
  if (!e164) return fallback;
  try {
    const parsed = parsePhoneNumberFromString(e164);
    if (!parsed) return e164;
    if (parsed.country === "US" || parsed.country === "CA") {
      return parsed.formatNational();
    }
    return parsed.formatInternational();
  } catch {
    return e164;
  }
}

export function isLikelyMobile(e164: string | null | undefined): boolean {
  if (!e164) return false;
  try {
    const parsed = parsePhoneNumberFromString(e164);
    if (!parsed) return false;
    const type = parsed.getType();
    return type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE" || !type;
  } catch {
    return false;
  }
}

export function isValidE164(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return isValidPhoneNumber(value);
  } catch {
    return false;
  }
}
