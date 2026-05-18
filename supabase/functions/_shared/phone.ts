// Deno-compatible phone normalizer for edge functions. Uses libphonenumber-js via esm.sh.
// @ts-nocheck
import { parsePhoneNumberFromString } from "https://esm.sh/libphonenumber-js@1.13.2/min";

export function normalizePhone(input: string | null | undefined, defaultCountry: string = "US") {
  if (!input || typeof input !== "string") {
    return { e164: null, valid: false, reason: "empty" };
  }
  const trimmed = input.trim();
  if (!trimmed) return { e164: null, valid: false, reason: "empty" };
  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as any);
    if (!parsed) return { e164: null, valid: false, reason: "unparseable" };
    if (!parsed.isValid()) return { e164: null, valid: false, reason: "invalid" };
    return { e164: parsed.number, valid: true };
  } catch (e) {
    return { e164: null, valid: false, reason: "error" };
  }
}
