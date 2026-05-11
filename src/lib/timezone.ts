import { useQuery } from "@tanstack/react-query";
import { format as fnsFormat } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_TIMEZONE = "America/Los_Angeles";
const SETTING_KEY = "church_timezone";
const STORAGE_KEY = "hotc_church_tz";

/**
 * Synchronously read the cached church timezone (set by useChurchTimezone).
 * Falls back to DEFAULT_TIMEZONE if nothing cached. Safe to use in
 * non-React code paths and one-off formatters.
 */
export function getChurchTimezone(): string {
  if (typeof window === "undefined") return DEFAULT_TIMEZONE;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Format a date/timestamp in the configured church timezone.
 * Accepts Date | string | number | null/undefined. Returns "" on null.
 */
export function formatInChurchTz(
  value: Date | string | number | null | undefined,
  pattern = "PPp",
  tz?: string
): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";
  return formatInTimeZone(date, tz || getChurchTimezone(), pattern);
}

export async function loadChurchTimezone(): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();
  const tz = (data?.value as any)?.tz as string | undefined;
  const resolved = tz || DEFAULT_TIMEZONE;
  try {
    window.localStorage.setItem(STORAGE_KEY, resolved);
  } catch { /* ignore */ }
  return resolved;
}

export async function saveChurchTimezone(tz: string) {
  const { error } = await supabase
    .from("app_settings")
    .upsert([{ key: SETTING_KEY, value: { tz } as any }], { onConflict: "key" });
  if (error) throw error;
  try {
    window.localStorage.setItem(STORAGE_KEY, tz);
  } catch { /* ignore */ }
}

export function useChurchTimezone() {
  const { data, ...rest } = useQuery({
    queryKey: ["church-timezone"],
    queryFn: loadChurchTimezone,
    staleTime: 5 * 60 * 1000,
  });
  const tz = data || getChurchTimezone();
  return {
    timezone: tz,
    format: (value: Date | string | number | null | undefined, pattern = "PPp") =>
      formatInChurchTz(value, pattern, tz),
    ...rest,
  };
}

/** Common IANA timezones for the picker. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Los_Angeles", label: "Pacific (PT) — Los Angeles" },
  { value: "America/Denver", label: "Mountain (MT) — Denver" },
  { value: "America/Phoenix", label: "Mountain — Phoenix (no DST)" },
  { value: "America/Chicago", label: "Central (CT) — Chicago" },
  { value: "America/New_York", label: "Eastern (ET) — New York" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
  { value: "UTC", label: "UTC" },
];

/** Lightweight wrapper if a caller already has the tz string. */
export function formatTz(date: Date | string | number, pattern: string, tz: string) {
  const d = date instanceof Date ? date : new Date(date);
  return formatInTimeZone(d, tz, pattern);
}

// Re-export for convenience so callers can swap `format` from date-fns
export { fnsFormat };
