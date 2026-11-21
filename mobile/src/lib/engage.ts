import { fmt, type Locale, watDayKey } from '@/lib/i18n';

export type EventKind = 'class' | 'exam' | 'event' | 'office_hours' | 'holiday';
export type CalendarEvent = {
  id: string;
  course_id: string | null;
  title: string;
  location: string | null;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  repeat_weekly_until: string | null;
};
export type Occurrence = CalendarEvent & { start: string; end: string; day: string };

const DAY = 86400000;

/** Expands weekly events into occurrences between two instants. */
export function expandEvents(events: CalendarEvent[], from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const start = new Date(ev.starts_at).getTime();
    const length = new Date(ev.ends_at).getTime() - start;
    const until = ev.repeat_weekly_until ? new Date(`${ev.repeat_weekly_until}T23:00:00Z`).getTime() : start + 1;
    for (let s = start, n = 0; s < until && s < to && n < 400; s += 7 * DAY, n++) {
      if (s + length <= from) continue;
      out.push({ ...ev, start: new Date(s).toISOString(), end: new Date(s + length).toISOString(), day: watDayKey(s) });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export const EVENT_COLORS: Record<EventKind, string> = {
  class: '#1F3B36',
  exam: '#B4532A',
  event: '#283669',
  office_hours: '#3D685E',
  holiday: '#8D5B07',
};

export type NotificationKind = 'announcement' | 'assignment' | 'grade' | 'submission' | 'message' | 'discussion' | 'results' | 'attendance';
export type AppNotification = {
  id: number;
  kind: NotificationKind;
  data: Record<string, string | number | null>;
  link: string | null;
  course_id: string | null;
  created_at: string;
  read_at: string | null;
};

export function notificationText(templates: Record<NotificationKind, string>, locale: Locale, n: Pick<AppNotification, 'kind' | 'data'>) {
  const data = { ...n.data };
  for (const key of ['score', 'points']) {
    const v = data[key];
    if (v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))) {
      data[key] = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 2 }).format(Number(v));
    }
  }
  return fmt(templates[n.kind] ?? '', data);
}

/** Days from today (Cameroon) to the instant's day; negative when past. */
export function daysUntil(iso: string, now: number) {
  const a = new Date(`${watDayKey(now)}T00:00:00Z`).getTime();
  const b = new Date(`${watDayKey(iso)}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY);
}
