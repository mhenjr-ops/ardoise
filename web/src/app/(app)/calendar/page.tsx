import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, MapPin, NotebookPen, Trash2 } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { nowMs } from "@/lib/format";
import {
  addDays,
  EVENT_COLORS,
  expandEvents,
  formatDayLabel,
  formatTime,
  monthGrid,
  watDayKey,
  watDayStart,
  weekStart,
  type Occurrence,
} from "@/lib/calendar";
import { Button, Card, Disclosure, Field, Flash, Input, PageHeader, Select, Textarea, cx } from "@/components/ui";
import type { CalendarEvent, CourseRole } from "@/lib/types";
import { createEvent, deleteEvent } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.calendar.title };
}

type CourseLite = { id: string; code: string; title: string; color: string };
type Due = { id: string; course_id: string; title: string; due_at: string };

const HOUR_START = 7;
const HOUR_END = 20;
const HOUR_PX = 56;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const [{ supabase, user, isAdminOrRegistrar }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "month";
  const today = watDayKey(nowMs());
  const anchor = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const error = errorText(t, typeof sp.error === "string" ? sp.error : null);

  const days = view === "month" ? monthGrid(anchor.slice(0, 7)) : Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  const from = watDayStart(days[0]);
  const to = watDayStart(addDays(days[days.length - 1], 1));

  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("role, course:courses(id, code, title, color)")
    .eq("user_id", user.id);
  const mine = ((enrolled ?? []) as Array<{ role: CourseRole; course: CourseLite | CourseLite[] | null }>)
    .map((r) => ({ role: r.role, course: Array.isArray(r.course) ? r.course[0] : r.course }))
    .filter((r): r is { role: CourseRole; course: CourseLite } => !!r.course);
  const courseById = new Map(mine.map((r) => [r.course.id, r.course]));
  const staffCourses = mine.filter((r) => r.role !== "student").map((r) => r.course);
  const staffIds = new Set(staffCourses.map((c) => c.id));

  const [{ data: evs }, { data: dues }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, institution_id, course_id, title, description, location, kind, starts_at, ends_at, repeat_weekly_until")
      .lt("starts_at", to.toISOString())
      .or(`repeat_weekly_until.gte.${days[0]},ends_at.gte.${from.toISOString()}`),
    mine.length
      ? supabase
          .from("assignments")
          .select("id, course_id, title, due_at")
          .in("course_id", mine.map((r) => r.course.id))
          .eq("published", true)
          .gte("due_at", from.toISOString())
          .lt("due_at", to.toISOString())
      : Promise.resolve({ data: [] as Due[] }),
  ]);
  const occurrences = expandEvents((evs ?? []) as CalendarEvent[], from, to);
  const dueList = (dues ?? []) as Due[];
  const byDay = new Map<string, { events: Occurrence[]; dues: Due[] }>();
  for (const d of days) byDay.set(d, { events: [], dues: [] });
  for (const o of occurrences) byDay.get(o.day)?.events.push(o);
  for (const d of dueList) byDay.get(watDayKey(d.due_at))?.dues.push(d);

  const canEdit = (ev: CalendarEvent) => (ev.course_id ? staffIds.has(ev.course_id) : isAdminOrRegistrar);
  const prev = view === "month" ? `${addDays(`${anchor.slice(0, 7)}-01`, -1).slice(0, 7)}-01` : addDays(anchor, -7);
  const next = view === "month" ? `${addDays(`${anchor.slice(0, 7)}-01`, 32).slice(0, 7)}-01` : addDays(anchor, 7);
  const href = (d: string, v = view) => `/calendar?view=${v}&d=${d}`;
  const back = href(anchor);
  const title =
    view === "month"
      ? formatDayLabel(locale, `${anchor.slice(0, 7)}-15`, { month: "long", year: "numeric" })
      : fmt(t.calendar.weekOf, { date: formatDayLabel(locale, days[0], { day: "numeric", month: "long" }) });
  const weekdayNames = days.slice(0, 7).map((d) => formatDayLabel(locale, d, { weekday: "short" }));
  const canCreate = staffCourses.length > 0 || isAdminOrRegistrar;

  const chip = (o: Occurrence) => (
    <span
      key={`${o.id}-${o.occurrence_start}`}
      className="flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-white"
      style={{ backgroundColor: EVENT_COLORS[o.kind] }}
      title={`${formatTime(locale, o.occurrence_start)} ${o.title}`}
    >
      <span className="num opacity-80">{formatTime(locale, o.occurrence_start)}</span>
      <span className="truncate">{o.title}</span>
    </span>
  );

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-slate-300 bg-paper p-0.5 text-[14px] font-semibold">
              {(["month", "week"] as const).map((v) => (
                <Link
                  key={v}
                  href={href(anchor, v)}
                  aria-current={view === v ? "page" : undefined}
                  className={cx("rounded-full px-3.5 py-1.5", view === v ? "bg-ardoise text-chalk" : "text-slate-600 hover:text-slate-900")}
                >
                  {v === "month" ? t.calendar.month : t.calendar.timetable}
                </Link>
              ))}
            </div>
          </div>
        }
      />
      <Flash error={error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Link href={href(prev)} aria-label={t.calendar.prev} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100">
              <ChevronLeft size={18} aria-hidden />
            </Link>
            <Link href={href(next)} aria-label={t.calendar.next} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100">
              <ChevronRight size={18} aria-hidden />
            </Link>
            <h2 className="font-display text-xl font-semibold capitalize">{title}</h2>
            <Link href={href(today)} className="ml-auto rounded-full border border-slate-300 px-3 py-1 text-[13.5px] font-semibold hover:bg-slate-50">
              {t.calendar.today}
            </Link>
          </div>

          {view === "month" ? (
            <div>
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
                {weekdayNames.map((w) => (
                  <div key={w} className="px-2 py-2 text-center text-[12.5px] font-bold capitalize text-slate-500">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d) => {
                  const cell = byDay.get(d)!;
                  const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
                  const isToday = d === today;
                  const total = cell.events.length + cell.dues.length;
                  return (
                    <Link
                      key={d}
                      href={href(d, "week")}
                      className={cx(
                        "min-h-[76px] border-b border-r border-slate-100 p-1.5 transition-colors hover:bg-ochre-50/50 sm:min-h-[104px]",
                        !inMonth && "bg-slate-50/50 text-slate-400",
                      )}
                    >
                      <span
                        className={cx(
                          "num mb-1 inline-grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold",
                          isToday && "bg-ochre-500 text-slate-950",
                        )}
                      >
                        {Number(d.slice(8))}
                      </span>
                      <div className="hidden space-y-1 sm:block">
                        {cell.events.slice(0, 2).map(chip)}
                        {cell.dues.slice(0, cell.events.length >= 2 ? 0 : 2 - cell.events.length).map((due) => (
                          <span key={due.id} className="flex items-center gap-1 truncate rounded-md bg-ochre-100 px-1.5 py-0.5 text-[12px] font-semibold text-ochre-700">
                            <NotebookPen size={11} aria-hidden />
                            <span className="truncate">{due.title}</span>
                          </span>
                        ))}
                        {total > 2 ? <span className="block px-1 text-[11.5px] font-bold text-slate-500">+{total - 2}</span> : null}
                      </div>
                      {total ? (
                        <span className="flex gap-0.5 sm:hidden">
                          {Array.from({ length: Math.min(total, 4) }, (_, i) => (
                            <span key={i} className="h-1.5 w-1.5 rotate-45 bg-ochre-500" />
                          ))}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,1fr)]">
                <div />
                {days.map((d) => (
                  <div key={d} className={cx("border-b border-l border-slate-100 px-2 py-2 text-center", d === today && "bg-ochre-50")}>
                    <div className="text-[12.5px] font-bold capitalize text-slate-500">{formatDayLabel(locale, d, { weekday: "short" })}</div>
                    <div className={cx("num font-display text-lg font-semibold", d === today && "text-ochre-700")}>{Number(d.slice(8))}</div>
                  </div>
                ))}
                <div className="relative" style={{ height: (HOUR_END - HOUR_START) * HOUR_PX }}>
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <span key={i} className="num absolute right-2 -translate-y-2 text-[11.5px] font-semibold text-slate-400" style={{ top: i * HOUR_PX }}>
                      {String(HOUR_START + i).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {days.map((d) => {
                  const cell = byDay.get(d)!;
                  return (
                    <div
                      key={d}
                      className={cx("relative border-l border-slate-100", d === today && "bg-ochre-50/40")}
                      style={{
                        height: (HOUR_END - HOUR_START) * HOUR_PX,
                        backgroundImage: `repeating-linear-gradient(to bottom, var(--color-slate-100) 0 1px, transparent 1px ${HOUR_PX}px)`,
                      }}
                    >
                      {cell.events.map((o) => {
                        const s = new Date(o.occurrence_start).getTime() - watDayStart(d).getTime();
                        const e = new Date(o.occurrence_end).getTime() - watDayStart(d).getTime();
                        const top = Math.max(0, (s / 3600000 - HOUR_START) * HOUR_PX);
                        const height = Math.max(26, ((e - s) / 3600000) * HOUR_PX - 3);
                        return (
                          <div
                            key={`${o.id}-${o.occurrence_start}`}
                            className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-white shadow-sm"
                            style={{ top, height, backgroundColor: EVENT_COLORS[o.kind] }}
                            title={o.title}
                          >
                            <p className="truncate text-[12.5px] font-bold leading-tight">{o.title}</p>
                            <p className="num truncate text-[11.5px] opacity-85">
                              {formatTime(locale, o.occurrence_start)}
                              {o.location ? ` · ${o.location}` : ""}
                            </p>
                          </div>
                        );
                      })}
                      {cell.dues.map((due) => {
                        const s = new Date(due.due_at).getTime() - watDayStart(d).getTime();
                        const top = Math.min(Math.max(0, (s / 3600000 - HOUR_START) * HOUR_PX), (HOUR_END - HOUR_START) * HOUR_PX - 22);
                        return (
                          <Link
                            key={due.id}
                            href={`/courses/${due.course_id}/assignments/${due.id}`}
                            className="absolute inset-x-1 flex items-center gap-1 truncate rounded-md border border-ochre-300 bg-ochre-100 px-1.5 py-0.5 text-[11.5px] font-bold text-ochre-800"
                            style={{ top }}
                          >
                            <NotebookPen size={11} aria-hidden />
                            <span className="truncate">{due.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {canCreate ? (
            <Disclosure summary={t.calendar.newEvent} open={!!error}>
              <form action={createEvent} className="space-y-3">
                <input type="hidden" name="back" value={back} />
                <Field label={t.calendar.eventTitle}>
                  <Input name="title" required maxLength={140} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.calendar.kind}>
                    <Select name="kind" defaultValue="class">
                      {(Object.keys(t.calendar.kinds) as Array<keyof typeof t.calendar.kinds>).map((k) => (
                        <option key={k} value={k}>
                          {t.calendar.kinds[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t.calendar.course}>
                    <Select name="scope" required defaultValue={staffCourses[0]?.id ?? "institution"}>
                      {staffCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                      {isAdminOrRegistrar ? <option value="institution">{t.calendar.wholeSchool}</option> : null}
                    </Select>
                  </Field>
                </div>
                <Field label={t.calendar.starts}>
                  <Input name="starts_at" type="datetime-local" required defaultValue={`${anchor}T08:00`} />
                </Field>
                <Field label={t.calendar.ends}>
                  <Input name="ends_at" type="datetime-local" defaultValue={`${anchor}T10:00`} />
                </Field>
                <Field label={t.calendar.location}>
                  <Input name="location" maxLength={80} placeholder="Amphi 300" />
                </Field>
                <Field label={t.calendar.repeatUntil}>
                  <Input name="repeat_until" type="date" />
                </Field>
                <Field label={t.common.description}>
                  <Textarea name="description" className="min-h-20" />
                </Field>
                <Button type="submit" className="w-full">
                  {t.common.create}
                </Button>
              </form>
            </Disclosure>
          ) : null}

          <Card>
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-[15px] font-bold">{view === "month" ? t.calendar.month : t.calendar.week}</h2>
            </div>
            <ol className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
              {days
                .filter((d) => (view === "week" || d.slice(0, 7) === anchor.slice(0, 7)) && (byDay.get(d)!.events.length || byDay.get(d)!.dues.length))
                .map((d) => {
                  const cell = byDay.get(d)!;
                  return (
                    <li key={d} className="px-5 py-3">
                      <p className={cx("mb-2 text-[13px] font-bold capitalize", d === today ? "text-ochre-700" : "text-slate-500")}>
                        {formatDayLabel(locale, d, { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                      <ul className="space-y-2">
                        {cell.events.map((o) => (
                          <li key={`${o.id}-${o.occurrence_start}`} className="flex gap-3">
                            <span className="mt-1 w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: EVENT_COLORS[o.kind] }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[14.5px] font-semibold leading-snug">{o.title}</p>
                              <p className="num flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-slate-500">
                                {formatTime(locale, o.occurrence_start)}–{formatTime(locale, o.occurrence_end)}
                                {o.course_id ? <span className="font-bold">{courseById.get(o.course_id)?.code}</span> : null}
                                {o.location ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <MapPin size={11} aria-hidden />
                                    {o.location}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            {canEdit(o) ? (
                              <form action={deleteEvent}>
                                <input type="hidden" name="id" value={o.id} />
                                <button type="submit" title={t.calendar.deleteEvent} className="rounded-md p-1 text-slate-400 hover:bg-terracotta-50 hover:text-terracotta-600">
                                  <Trash2 size={14} aria-hidden />
                                  <span className="sr-only">{t.calendar.deleteEvent}</span>
                                </button>
                              </form>
                            ) : null}
                          </li>
                        ))}
                        {cell.dues.map((due) => (
                          <li key={due.id}>
                            <Link href={`/courses/${due.course_id}/assignments/${due.id}`} className="flex items-center gap-2 text-[14px] font-semibold text-ochre-700 hover:underline">
                              <NotebookPen size={13} aria-hidden />
                              <span className="sr-only">{t.calendar.due}</span>
                              {due.title}
                              <span className="num text-[12.5px] text-slate-500">{courseById.get(due.course_id)?.code}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
            </ol>
            {occurrences.length === 0 && dueList.length === 0 ? <p className="px-5 py-6 text-[15px] text-slate-500">{t.calendar.noEvents}</p> : null}
          </Card>
        </div>
      </div>
    </>
  );
}
