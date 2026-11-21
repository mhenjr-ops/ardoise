import type { Locale } from "@/lib/i18n/messages";

const TIME_ZONE = "Africa/Douala";

export function formatDateTime(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDate(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** Formats a mark the French way (14,5) or the English way (14.5). */
export function formatScore(locale: Locale, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Converts a <input type="datetime-local"> value, entered as Cameroon time
 * (WAT, UTC+1, no daylight saving), into an ISO timestamp.
 */
export function cameroonLocalToIso(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi)).toISOString();
}

/** Converts an ISO timestamp back into a datetime-local value in Cameroon time. */
export function isoToCameroonLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const shifted = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

/** ISO timestamp N days from now (negative for the past). */
export function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

export function isPast(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

/** Current time as ISO (kept out of components so renders stay pure). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Current time in ms (kept out of components so renders stay pure). */
export function nowMs(): number {
  return Date.now();
}

export function formatBytes(locale: Locale, bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go"];
  const unitsEn = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: i ? 1 : 0 }).format(v);
  return `${n} ${(locale === "fr" ? units : unitsEn)[i]}`;
}
