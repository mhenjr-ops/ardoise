import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, ClipboardCheck, MapPin } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { daysFromNowIso, formatScore, nowMs } from "@/lib/format";
import { weightedAverage } from "@/lib/grades";
import { addDays, daysUntil, EVENT_COLORS, expandEvents, formatDayLabel, formatTime, watDayKey, watDayStart } from "@/lib/calendar";
import { notificationText, timeAgo } from "@/lib/notifications";
import { Card, CardHeader, Empty } from "@/components/ui";
import { NDOP_CHALK } from "@/lib/ndop";
import { CourseCard } from "@/components/course/course-card";
import { SetupChecklist } from "@/components/home/setup-checklist";
import { OfficePanel } from "@/components/home/office-panel";
import { DepartmentPanel } from "@/components/home/department-panel";
import type { AppNotification, CalendarEvent, Course, CourseRole } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dashboard.title };
}

type EnrollmentRow = { role: CourseRole; course: Course | Course[] | null };
type Item = { id: string; course_id: string; title: string; due_at: string | null; points_possible: number; weight: number; published: boolean };

export default async function DashboardPage() {
  const [{ supabase, user, institution, can, roles, memberships, profile }, { t, locale }] = await Promise.all([
    requireInstitution(),
    getI18n(),
  ]);
  const now = nowMs();
  const today = watDayKey(now);

  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("role, course:courses(id, institution_id, code, title, description, language, level, color, published)")
    .eq("user_id", user.id);

  // "My courses" are the ones I teach or take; the office and departments get their own panels.
  const byId = new Map<string, { course: Course; role: CourseRole }>();
  for (const row of (enrollmentRows ?? []) as EnrollmentRow[]) {
    const course = Array.isArray(row.course) ? row.course[0] : row.course;
    if (course) byId.set(course.id, { course, role: row.role });
  }
  const cards = [...byId.values()].sort((a, b) => a.course.code.localeCompare(b.course.code));
  const courseIds = cards.map((c) => c.course.id);
  const studentIds = cards.filter((c) => c.role === "student").map((c) => c.course.id);
  const staffIds = cards.filter((c) => c.role !== "student").map((c) => c.course.id);

  const [assignmentsRes, eventsRes, notifRes] = await Promise.all([
    courseIds.length
      ? supabase
          .from("assignments")
          .select("id, course_id, title, due_at, points_possible, weight, published")
          .in("course_id", courseIds)
          .eq("published", true)
      : Promise.resolve({ data: [] as Item[] }),
    supabase
      .from("calendar_events")
      .select("id, institution_id, course_id, title, description, location, kind, starts_at, ends_at, repeat_weekly_until")
      .lte("starts_at", watDayStart(addDays(today, 1)).toISOString())
      .or(`repeat_weekly_until.gte.${today},ends_at.gte.${watDayStart(today).toISOString()}`),
    supabase
      .from("notifications")
      .select("id, kind, data, link, course_id, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const assignments = (assignmentsRes.data ?? []) as Item[];
  const todays = expandEvents((eventsRes.data ?? []) as CalendarEvent[], watDayStart(today), watDayStart(addDays(today, 1)));
  const latest = (notifRes.data ?? []) as AppNotification[];

  // ----- Student side: what's handed in, marks, attendance -----
  const studentAssignments = assignments.filter((a) => studentIds.includes(a.course_id));
  const [subsRes, quizRes, gradesRes, attendanceRes] = studentIds.length
    ? await Promise.all([
        supabase.from("submissions").select("assignment_id").eq("student_id", user.id).in("course_id", studentIds),
        supabase.from("quiz_attempts").select("assignment_id").eq("student_id", user.id).not("submitted_at", "is", null),
        supabase.from("grades").select("assignment_id, student_id, score").eq("student_id", user.id).in("course_id", studentIds),
        supabase.from("attendance_records").select("status").eq("student_id", user.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const handedIn = new Set(
    [...(subsRes.data ?? []), ...(quizRes.data ?? []), ...(gradesRes.data ?? [])].map((r: { assignment_id: string }) => r.assignment_id),
  );
  const grades = (gradesRes.data ?? []) as Array<{ assignment_id: string; student_id: string; score: number | null }>;
  const courseAverages = studentIds
    .map((cid) => weightedAverage(studentAssignments.filter((a) => a.course_id === cid), grades, user.id))
    .filter((v): v is number => v !== null);
  const overall = courseAverages.length ? courseAverages.reduce((s, v) => s + v, 0) / courseAverages.length : null;
  const att = (attendanceRes.data ?? []) as Array<{ status: string }>;
  const attendanceRate = att.length ? att.filter((r) => r.status !== "absent").length / att.length : null;

  const horizon = daysFromNowIso(21);
  const dueSoon = studentAssignments
    .filter((a) => a.due_at && a.due_at <= horizon && !handedIn.has(a.id) && daysUntil(a.due_at, now) >= -7)
    .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""))
    .slice(0, 6);

  // ----- Staff side: work to mark -----
  const toGrade = new Map<string, number>();
  let studentCount = 0;
  if (staffIds.length) {
    const [{ data: subs }, { data: staffGrades }, { data: studentRows }] = await Promise.all([
      supabase.from("submissions").select("course_id, assignment_id, student_id").in("course_id", staffIds),
      supabase.from("grades").select("assignment_id, student_id, score").in("course_id", staffIds),
      supabase.from("enrollments").select("user_id").in("course_id", staffIds).eq("role", "student"),
    ]);
    studentCount = new Set((studentRows ?? []).map((r: { user_id: string }) => r.user_id)).size;
    const graded = new Set(
      (staffGrades ?? [])
        .filter((g: { score: number | null }) => g.score !== null)
        .map((g: { assignment_id: string; student_id: string }) => `${g.assignment_id}:${g.student_id}`),
    );
    for (const s of (subs ?? []) as Array<{ course_id: string; assignment_id: string; student_id: string }>) {
      if (!graded.has(`${s.assignment_id}:${s.student_id}`)) toGrade.set(s.course_id, (toGrade.get(s.course_id) ?? 0) + 1);
    }
  }
  const totalToGrade = [...toGrade.values()].reduce((s, n) => s + n, 0);

  // School-wide figures for the office (owner, admin, registrar) when they don't teach.
  const office = can.manageStudents && staffIds.length === 0 && studentIds.length === 0;
  let officeStats: { linked: number; total: number; staff: number; courses: number; claims: number } | null = null;
  if (office) {
    const head = { count: "exact" as const, head: true };
    const [total, linked, staff, courseCount, claims] = await Promise.all([
      supabase.from("student_roster").select("id", head).eq("institution_id", institution.id),
      supabase.from("student_roster").select("id", head).eq("institution_id", institution.id).not("claimed_by", "is", null),
      supabase.from("memberships").select("id", head).eq("institution_id", institution.id).neq("role", "student"),
      supabase.from("courses").select("id", head).eq("institution_id", institution.id),
      supabase.from("matricule_claims").select("id", head).eq("institution_id", institution.id).in("status", ["waiting", "disputed"]),
    ]);
    officeStats = {
      linked: linked.count ?? 0,
      total: total.count ?? 0,
      staff: staff.count ?? 0,
      courses: courseCount.count ?? 0,
      claims: claims.count ?? 0,
    };
  }

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Douala" }).format(now));
  const greeting = hour < 17 ? t.shell.goodMorning : t.shell.goodEvening;
  const firstName = (profile.full_name || "").replace(/^(Dr|Pr|M\.|Mme)\s+/i, "").split(" ")[0];
  const isStudent = studentIds.length > 0 && staffIds.length === 0;

  const stats: Array<{ label: string; value: string | number; tone: string; suffix?: string }> = officeStats
    ? [
        { label: t.home.students, value: officeStats.linked, suffix: `/ ${officeStats.total}`, tone: "text-chalk" },
        { label: t.home.staff, value: officeStats.staff, tone: "text-chalk" },
        { label: t.home.courses, value: officeStats.courses, tone: "text-chalk" },
        { label: t.home.toCheck, value: officeStats.claims, tone: officeStats.claims ? "text-ochre-300" : "text-chalk" },
      ]
    : !staffIds.length && !studentIds.length
      ? []
      : isStudent
    ? [
        {
          label: t.dash.statAverage,
          value: overall === null ? "—" : formatScore(locale, Math.round(overall * 100) / 100),
          suffix: "/20",
          tone: overall !== null && overall < 10 ? "text-terracotta-300" : "text-chalk",
        },
        {
          label: t.dash.statAttendance,
          value: attendanceRate === null ? "—" : `${Math.round(attendanceRate * 100)}%`,
          tone: attendanceRate !== null && attendanceRate < 0.75 ? "text-terracotta-300" : "text-chalk",
        },
        { label: t.dash.statDue, value: dueSoon.length, tone: dueSoon.length ? "text-ochre-300" : "text-chalk" },
        { label: t.dash.statCourses, value: cards.length, tone: "text-chalk" },
      ]
    : [
        { label: t.dash.statCourses, value: cards.length, tone: "text-chalk" },
        { label: t.dash.statStudents, value: studentCount, tone: "text-chalk" },
        { label: t.dash.statToGrade, value: totalToGrade, tone: totalToGrade ? "text-ochre-300" : "text-chalk" },
        { label: t.calendar.timetable, value: todays.length, tone: "text-chalk", suffix: t.shell.today.toLowerCase() },
      ];
  const topRole = (["owner", "admin", "registrar", "dean", "hod", "teacher", "student"] as const).find((r) => roles.includes(r));

  function dueLabel(iso: string) {
    const d = daysUntil(iso, now);
    if (d < 0) return { text: t.dash.overdue, cls: "bg-terracotta-50 text-terracotta-600" };
    if (d === 0) return { text: t.dash.dueToday, cls: "bg-ochre-100 text-ochre-700" };
    if (d === 1) return { text: t.dash.dueTomorrow, cls: "bg-ochre-50 text-ochre-700" };
    return { text: fmt(t.dash.dueInDays, { n: d }), cls: "bg-slate-100 text-slate-600" };
  }

  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-[24px] bg-ardoise text-chalk">
        <div aria-hidden className="absolute inset-0 opacity-80" style={{ backgroundImage: NDOP_CHALK }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ardoise via-ardoise/90 to-ardoise/40" />
        <div className="relative grid gap-7 px-6 py-7 md:px-8 md:py-9 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[14.5px] font-semibold text-chalk/60 first-letter:uppercase">
              {formatDayLabel(locale, today, { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-1 font-display text-[2.3rem] font-semibold leading-tight md:text-[2.8rem]">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-[16px] text-chalk/70">
              {topRole && topRole !== "student" && topRole !== "teacher" ? `${t.roles[topRole]} · ${institution.name}` : t.dash.subtitle}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[13px] font-semibold text-chalk/60">{s.label}</dt>
                <dd className={`num mt-0.5 font-display text-[2rem] font-semibold leading-none ${s.tone}`}>
                  {s.value}
                  {s.suffix ? <span className="ml-1 text-[15px] text-chalk/50">{s.suffix}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {can.manageSchool ? <SetupChecklist supabase={supabase} institution={institution} t={t} /> : null}
      {can.manageStudents ? <OfficePanel supabase={supabase} institutionId={institution.id} t={t} /> : null}
      {can.oversees ? (
        <DepartmentPanel supabase={supabase} institutionId={institution.id} memberships={memberships} t={t} locale={locale} />
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
        <section>
          {cards.length || !can.isStaff ? <h2 className="mb-4 font-display text-2xl font-semibold">{t.dash.coursesTitle}</h2> : null}
          {cards.length === 0 ? (
            can.isStaff ? null : <Empty>{t.dashboard.noCourses}</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ course, role }) => {
                const mine = assignments.filter((a) => a.course_id === course.id);
                const progress = role === "student" && mine.length ? mine.filter((a) => handedIn.has(a.id)).length / mine.length : null;
                const pending = toGrade.get(course.id) ?? 0;
                return (
                  <CourseCard
                    key={course.id}
                    href={`/courses/${course.id}`}
                    code={course.code}
                    title={course.title}
                    color={course.color}
                    level={course.level}
                    roleLabel={role === "student" ? t.dashboard.student : t.dashboard.teaching}
                    progress={progress}
                    progressLabel={t.dash.done}
                    footer={
                      pending ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-ochre-100 px-2.5 py-0.5 text-[12.5px] font-bold text-ochre-700">
                          <ClipboardCheck size={13} aria-hidden />
                          {fmt(t.dash.toGrade, { n: pending })}
                        </span>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader title={t.dash.todayTitle} action={<Link href="/calendar" className="text-[13.5px] font-semibold text-brand-600 hover:underline">{t.shell.viewAll}</Link>} />
            {todays.length === 0 ? (
              <p className="px-5 py-5 text-[15px] text-slate-500">{t.dash.nothingToday}</p>
            ) : (
              <ol className="relative px-5 py-4">
                {todays.map((ev) => (
                  <li key={`${ev.id}-${ev.occurrence_start}`} className="relative flex gap-4 pb-4 last:pb-0">
                    <span className="num w-12 shrink-0 pt-0.5 text-right text-[13.5px] font-bold text-slate-500">
                      {formatTime(locale, ev.occurrence_start)}
                    </span>
                    <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: EVENT_COLORS[ev.kind] }} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">{ev.title}</span>
                      <span className="flex items-center gap-1 text-[13px] text-slate-500">
                        {formatTime(locale, ev.occurrence_end)}
                        {ev.location ? (
                          <>
                            <MapPin size={12} aria-hidden className="ml-1.5" />
                            {ev.location}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {studentIds.length ? (
            <Card>
              <CardHeader title={t.dash.upNext} />
              {dueSoon.length === 0 ? (
                <p className="px-5 py-5 text-[15px] text-slate-500">{t.dash.allClear}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dueSoon.map((a) => {
                    const label = dueLabel(a.due_at as string);
                    return (
                      <li key={a.id}>
                        <Link href={`/courses/${a.course_id}/assignments/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                          <CalendarClock size={18} className="shrink-0 text-slate-400" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{a.title}</span>
                            <span className="num block text-[13px] text-slate-500">{byId.get(a.course_id)?.course.code}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${label.cls}`}>{label.text}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t.dash.latest} action={<Link href="/notifications" className="text-[13.5px] font-semibold text-brand-600 hover:underline">{t.shell.viewAll}</Link>} />
            {latest.length === 0 ? (
              <p className="px-5 py-5 text-[15px] text-slate-500">{t.shell.noNotifications}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {latest.map((n) => (
                  <li key={n.id}>
                    <Link href={n.link ?? "/notifications"} className="flex gap-3 px-5 py-3 hover:bg-slate-50">
                      <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rotate-45 ${n.read_at ? "bg-slate-300" : "bg-ochre-500"}`} />
                      <span className="min-w-0">
                        <span className="block text-[14.5px] leading-snug text-slate-800">{notificationText(t.notif, locale, n)}</span>
                        <span className="text-[12.5px] text-slate-500">{timeAgo(locale, n.created_at, now)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
