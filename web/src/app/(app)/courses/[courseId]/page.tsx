import Link from "next/link";
import { CalendarCheck2, Clock3, MapPin, Megaphone, MessagesSquare, NotebookPen } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { daysFromNowIso, formatDateTime, formatScore, isPast, nowMs } from "@/lib/format";
import { weightedAverage } from "@/lib/grades";
import { expandEvents, formatDayLabel, formatTime, watDayKey } from "@/lib/calendar";
import { timeAgo } from "@/lib/notifications";
import { Button, Card, CardHeader, Disclosure, ProgressRing, Textarea, buttonClass } from "@/components/ui";
import type { Announcement, Assignment, CalendarEvent } from "@/lib/types";
import { dropCourse, updateDescription } from "./actions";

export default async function CourseHomePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const [{ supabase, course, isStaff, courseRole, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const now = nowMs();
  const base = `/courses/${course.id}`;
  const isStudent = courseRole === "student";

  const [{ data: announcements }, { data: upcoming }, { data: events }, { data: topics }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, course_id, title, body, author_id, created_at")
      .eq("course_id", course.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("assignments")
      .select("id, course_id, title, due_at, points_possible, component")
      .eq("course_id", course.id)
      .gte("due_at", daysFromNowIso(0))
      .order("due_at", { ascending: true })
      .limit(5),
    supabase
      .from("calendar_events")
      .select("id, institution_id, course_id, title, description, location, kind, starts_at, ends_at, repeat_weekly_until")
      .eq("course_id", course.id),
    supabase
      .from("discussion_topics")
      .select("id, title, reply_count, last_activity_at")
      .eq("course_id", course.id)
      .order("last_activity_at", { ascending: false })
      .limit(3),
  ]);
  const nextClass = expandEvents((events ?? []) as CalendarEvent[], new Date(now), new Date(now + 14 * 86400000))[0] ?? null;

  // Student side: progress, average, attendance
  let progress: number | null = null;
  let average: number | null = null;
  let attendance: number | null = null;
  let addedAuto = false;
  if (isStudent) {
    const [{ data: all }, { data: subs }, { data: grades }, { data: att }, { data: mine }] = await Promise.all([
      supabase.from("assignments").select("id, points_possible, weight").eq("course_id", course.id).eq("published", true),
      supabase.from("submissions").select("assignment_id").eq("course_id", course.id).eq("student_id", user.id),
      supabase.from("grades").select("assignment_id, student_id, score").eq("course_id", course.id).eq("student_id", user.id),
      supabase.from("attendance_records").select("status").eq("course_id", course.id).eq("student_id", user.id),
      supabase.from("enrollments").select("added_by").eq("course_id", course.id).eq("user_id", user.id).eq("role", "student").maybeSingle(),
    ]);
    addedAuto = mine?.added_by === "auto";
    const done = new Set([...(subs ?? []), ...(grades ?? []).filter((g) => g.score !== null)].map((r) => r.assignment_id));
    progress = (all ?? []).length ? (all ?? []).filter((a) => done.has(a.id)).length / (all ?? []).length : null;
    average = weightedAverage((all ?? []) as Array<{ id: string; points_possible: number; weight: number }>, grades ?? [], user.id);
    attendance = (att ?? []).length ? (att ?? []).filter((r) => r.status !== "absent").length / (att ?? []).length : null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        {nextClass ? (
          <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-slate-200 bg-paper px-5 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ backgroundColor: course.color }}>
              <Clock3 size={20} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-500">{nextClass.title}</p>
              <p className="font-display text-xl font-semibold first-letter:uppercase">
                {formatDayLabel(locale, watDayKey(nextClass.occurrence_start), { weekday: "long", day: "numeric", month: "long" })},{" "}
                {formatTime(locale, nextClass.occurrence_start)}
              </p>
            </div>
            {nextClass.location ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[13.5px] font-semibold text-slate-700">
                <MapPin size={14} aria-hidden />
                {nextClass.location}
              </span>
            ) : null}
          </div>
        ) : null}

        <Card>
          <CardHeader title={t.course.about} />
          <div className="space-y-4 px-6 py-5">
            <p className="prose-lite text-[16px] text-slate-700">{course.description || "—"}</p>
            {isStaff ? (
              <Disclosure summary={t.common.edit}>
                <form action={updateDescription} className="space-y-3">
                  <input type="hidden" name="course_id" value={course.id} />
                  <Textarea name="description" defaultValue={course.description} rows={5} />
                  <Button type="submit" size="sm">
                    {t.common.save}
                  </Button>
                </form>
              </Disclosure>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t.course.recentAnnouncements}
            icon={<Megaphone size={16} aria-hidden />}
            action={
              <Link href={`${base}/announcements`} className="text-[13.5px] font-semibold text-brand-600 hover:underline">
                {t.shell.viewAll}
              </Link>
            }
          />
          {(announcements ?? []).length === 0 ? (
            <p className="px-5 py-6 text-[15px] text-slate-500">{t.course.noAnnouncements}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {((announcements ?? []) as Announcement[]).map((a) => (
                <li key={a.id} className="px-6 py-4">
                  <p className="text-[16px] font-bold text-slate-900">{a.title}</p>
                  <p className="text-[12.5px] text-slate-500">{formatDateTime(locale, a.created_at)}</p>
                  <p className="prose-lite mt-2 line-clamp-3 text-[15px] text-slate-700">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {(topics ?? []).length ? (
          <Card>
            <CardHeader
              title={t.discussions.title}
              icon={<MessagesSquare size={16} aria-hidden />}
              action={
                <Link href={`${base}/discussions`} className="text-[13.5px] font-semibold text-brand-600 hover:underline">
                  {t.shell.viewAll}
                </Link>
              }
            />
            <ul className="divide-y divide-slate-100">
              {(topics ?? []).map((tp) => (
                <li key={tp.id}>
                  <Link href={`${base}/discussions/${tp.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{tp.title}</span>
                    <span className="num text-[13px] font-bold text-slate-500">{tp.reply_count}</span>
                    <span className="w-20 text-right text-[12.5px] text-slate-400">{timeAgo(locale, tp.last_activity_at, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6 self-start">
        {isStudent ? (
          <Card className="grid grid-cols-3 divide-x divide-slate-100 py-4 text-center">
            <div className="flex flex-col items-center gap-1.5 px-2">
              <ProgressRing value={progress ?? 0} size={48} label={progress === null ? "—" : `${Math.round(progress * 100)}`} />
              <span className="text-[12px] font-semibold text-slate-500">{t.dash.done}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 px-2">
              <span className={`num font-display text-2xl font-semibold ${average !== null && average < 10 ? "text-terracotta-500" : ""}`}>
                {average === null ? "—" : formatScore(locale, average)}
              </span>
              <span className="text-[12px] font-semibold text-slate-500">{t.grades.average}</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-1 px-2">
              <span className={`num font-display text-2xl font-semibold ${attendance !== null && attendance < 0.75 ? "text-terracotta-500" : "text-leaf-600"}`}>
                {attendance === null ? "—" : `${Math.round(attendance * 100)}%`}
              </span>
              <span className="text-[12px] font-semibold text-slate-500">{t.attendance.rate}</span>
            </div>
          </Card>
        ) : null}

        {isStaff ? (
          <Card className="space-y-2 p-4">
            <Link href={`${base}/announcements`} className={`${buttonClass("secondary")} w-full justify-start`}>
              <Megaphone size={16} aria-hidden />
              {t.course.newAnnouncement}
            </Link>
            <Link href={`${base}/attendance`} className={`${buttonClass("secondary")} w-full justify-start`}>
              <CalendarCheck2 size={16} aria-hidden />
              {t.attendance.newSession}
            </Link>
            <Link href={`${base}/assignments`} className={`${buttonClass("secondary")} w-full justify-start`}>
              <NotebookPen size={16} aria-hidden />
              {t.assignments.newAssignment}
            </Link>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t.course.upcoming} />
          {(upcoming ?? []).length === 0 ? (
            <p className="px-5 py-6 text-[15px] text-slate-500">{t.dashboard.nothingDue}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {((upcoming ?? []) as Assignment[]).map((a) => (
                <li key={a.id}>
                  <Link href={`${base}/assignments/${a.id}`} className="block px-5 py-3 hover:bg-slate-50">
                    <span className="block text-[15px] font-semibold text-slate-900">{a.title}</span>
                    <span className={`text-[12.5px] ${isPast(a.due_at) ? "text-terracotta-600" : "text-slate-500"}`}>
                      {formatDateTime(locale, a.due_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {addedAuto ? (
          <Card className="p-4">
            <p className="text-[14.5px] font-semibold text-slate-900">{t.catalogue.dropTitle}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{t.catalogue.dropHelp}</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-[13.5px] font-semibold text-terracotta-600 hover:underline">{t.catalogue.drop}</summary>
              <form action={dropCourse} className="mt-2 space-y-2">
                <input type="hidden" name="course_id" value={course.id} />
                <p className="text-[13.5px] text-slate-600">{t.catalogue.dropConfirm}</p>
                <Button type="submit" size="sm" variant="danger">
                  {t.catalogue.drop}
                </Button>
              </form>
            </details>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
