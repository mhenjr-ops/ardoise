import type { CalendarEvent } from "@/lib/types";

/** Cameroon is on WAT, UTC+1, with no daylight saving. */
const WAT_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11-21" for an instant, as seen in Cameroon. */
export function watDayKey(input: string | number | Date): string {
  return new Date(new Date(input).getTime() + WAT_MS).toISOString().slice(0, 10);
}

/** The instant a Cameroon calendar day starts. */
export function watDayStart(dayKey: string): Date {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - WAT_MS);
}

export function addDays(dayKey: string, n: number): string {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing dayKey. */
export function weekStart(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(dayKey, -dow);
}

export function monthGrid(monthKey: string): string[] {
  // monthKey "2026-11" → 6 weeks of day keys starting on a Monday
  const first = `${monthKey}-01`;
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export type Occurrence = CalendarEvent & { occurrence_start: string; occurrence_end: string; day: string };

/** Expands weekly events into occurrences between two instants. */
export function expandEvents(events: CalendarEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const start = new Date(ev.starts_at).getTime();
    const length = new Date(ev.ends_at).getTime() - start;
    const until = ev.repeat_weekly_until ? watDayStart(ev.repeat_weekly_until).getTime() + DAY_MS : start + 1;
    for (let s = start, guard = 0; s < until && s < to.getTime() && guard < 400; s += 7 * DAY_MS, guard++) {
      if (s + length <= from.getTime()) continue;
      out.push({
        ...ev,
        occurrence_start: new Date(s).toISOString(),
        occurrence_end: new Date(s + length).toISOString(),
        day: watDayKey(s),
      });
    }
  }
  return out.sort((a, b) => a.occurrence_start.localeCompare(b.occurrence_start));
}

export function formatTime(locale: "fr" | "en", iso: string): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Douala",
  }).format(new Date(iso));
}

export function formatDayLabel(locale: "fr" | "en", dayKey: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { ...opts, timeZone: "UTC" }).format(
    new Date(`${dayKey}T12:00:00Z`),
  );
}

/** Whole days from today (Cameroon) until the instant's day; negative when past. */
export function daysUntil(iso: string, nowMs: number): number {
  const a = new Date(`${watDayKey(nowMs)}T00:00:00Z`).getTime();
  const b = new Date(`${watDayKey(iso)}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

export const EVENT_COLORS: Record<CalendarEvent["kind"], string> = {
  class: "#1f3b36",
  exam: "#b4532a",
  event: "#283669",
  office_hours: "#3d685e",
  holiday: "#8d5b07",
};
