import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList, Users } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Badge, Button, Card, CardHeader, Field, Flash, Input, Select, Stat, cx } from "@/components/ui";
import { fmt } from "@/lib/i18n/messages-engage";
import { fetchAll } from "@/lib/fetch-all";
import { weightedAverage } from "@/lib/grades";
import { formatScore } from "@/lib/format";
import type { Course, InstitutionRole } from "@/lib/types";
import { createCourse } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.title };
}

type MemberRow = { user_id: string; role: InstitutionRole };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const [{ supabase, institution, can }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error, ok } = await searchParams;

  // Deans and heads of department work from their dashboard and the Staff tab.
  if (!can.manageStudents) redirect(can.adminArea ? "/admin/people" : "/dashboard");

  const [{ data: courseData }, { data: memberData }, { data: depData }, { count: rosterTotal }, { count: rosterLinked }, { count: claimCount }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id, institution_id, department_id, code, title, description, language, level, color, published")
        .eq("institution_id", institution.id)
        .order("code"),
      supabase.from("memberships").select("user_id, role").eq("institution_id", institution.id),
      supabase.from("departments").select("id, name").eq("institution_id", institution.id).order("name"),
      supabase.from("student_roster").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
      supabase.from("student_roster").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).not("claimed_by", "is", null),
      supabase.from("matricule_claims").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).in("status", ["waiting", "disputed"]),
    ]);
  const courses = (courseData ?? []) as Course[];
  const departments = (depData ?? []) as Array<{ id: string; name: string }>;
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const rolesByUser = new Map<string, Set<InstitutionRole>>();
  for (const row of (memberData ?? []) as MemberRow[]) {
    rolesByUser.set(row.user_id, (rolesByUser.get(row.user_id) ?? new Set()).add(row.role));
  }
  const countRole = (r: InstitutionRole) => [...rolesByUser.values()].filter((set) => set.has(r)).length;
  const staffCount = [...rolesByUser.values()].filter((set) => [...set].some((r) => r !== "student")).length;

  // Institution overview: course averages, attendance, latest deliberation outcomes.
  const courseIds = courses.map((c) => c.id);
  const [assignments, grades, enrollments, attendance, { data: results }] = await Promise.all([
    courseIds.length
      ? fetchAll<{ id: string; course_id: string; points_possible: number; weight: number }>((from, to) =>
          supabase.from("assignments").select("id, course_id, points_possible, weight").in("course_id", courseIds).eq("published", true).range(from, to),
        )
      : Promise.resolve([]),
    courseIds.length
      ? fetchAll<{ assignment_id: string; student_id: string; score: number | null; course_id: string }>((from, to) =>
          supabase.from("grades").select("assignment_id, student_id, score, course_id").in("course_id", courseIds).range(from, to),
        )
      : Promise.resolve([]),
    courseIds.length
      ? fetchAll<{ course_id: string; user_id: string }>((from, to) =>
          supabase.from("enrollments").select("course_id, user_id").in("course_id", courseIds).eq("role", "student").range(from, to),
        )
      : Promise.resolve([]),
    fetchAll<{ status: string }>((from, to) =>
      supabase.from("attendance_records").select("status").eq("institution_id", institution.id).range(from, to),
    ),
    supabase.from("deliberation_results").select("decision").eq("institution_id", institution.id).limit(5000),
  ]);
  const courseAverages = courses
    .map((c) => {
      const as = assignments.filter((a) => a.course_id === c.id);
      const gs = grades.filter((g) => g.course_id === c.id);
      const avgs = enrollments
        .filter((e) => e.course_id === c.id)
        .map((e) => weightedAverage(as, gs, e.user_id))
        .filter((v): v is number => v !== null);
      return { course: c, avg: avgs.length ? avgs.reduce((x, y) => x + y, 0) / avgs.length : null };
    })
    .filter((r) => r.avg !== null) as Array<{ course: Course; avg: number }>;
  const attRate = attendance.length ? attendance.filter((r) => r.status !== "absent").length / attendance.length : null;
  const decided = (results ?? []) as Array<{ decision: string }>;
  const passRate = decided.length
    ? decided.filter((r) => r.decision === "admitted" || r.decision === "admitted_compensation").length / decided.length
    : null;

  return (
    <>
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />

      <section className="mb-8">
        <h2 className="mb-4 font-display text-2xl font-semibold">{t.analytics.institutionTitle}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t.dash.statStudents} value={countRole("student")} hint={`${staffCount} ${t.home.staff.toLowerCase()}`} />
          <Stat label={t.dash.statCourses} value={courses.length} />
          <Stat
            label={t.analytics.attendance}
            value={attRate === null ? "—" : `${Math.round(attRate * 100)} %`}
            tone={attRate !== null && attRate < 0.75 ? "terracotta" : "leaf"}
          />
          <Stat
            label={t.analytics.passRate}
            value={passRate === null ? "—" : `${Math.round(passRate * 100)} %`}
            tone={passRate !== null && passRate < 0.5 ? "terracotta" : "ochre"}
          />
        </div>
        {courseAverages.length ? (
          <Card className="mt-4">
            <CardHeader title={t.analytics.byCourse} />
            <ul className="space-y-3 px-5 py-4">
              {courseAverages.map(({ course, avg }) => (
                <li key={course.id} className="grid grid-cols-[72px_1fr_56px] items-center gap-3">
                  <span className="num text-[13.5px] font-extrabold" style={{ color: course.color }}>
                    {course.code}
                  </span>
                  <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className={cx("h-full rounded-full", avg < 10 ? "bg-terracotta-400" : "bg-ardoise")} style={{ width: `${(avg / 20) * 100}%` }} />
                    <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-ochre-500" />
                  </div>
                  <span className={cx("num text-right font-display text-[17px] font-semibold", avg < 10 && "text-terracotta-600")}>
                    {formatScore(locale, Math.round(avg * 100) / 100)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${t.admin.courses} (${courses.length})`} />
          {can.manageSchool ? (
          <form action={createCourse} className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2">
            <input type="hidden" name="institution_id" value={institution.id} />
            <Field label={t.admin.code}>
              <Input name="code" required placeholder="INF101" />
            </Field>
            <Field label={t.admin.level}>
              <Input name="level" placeholder="L1" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.admin.courseTitle}>
                <Input name="title" required placeholder="Algorithmique et programmation" />
              </Field>
            </div>
            <Field label={t.admin.language}>
              <Select name="language" defaultValue={locale}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t.staffing.department}>
              <Select name="department_id" defaultValue="">
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={`${t.admin.teacherEmail} (${t.common.optional})`}>
                <Input name="teacher_email" type="email" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t.admin.newCourse}</Button>
            </div>
          </form>
          ) : null}
          {courses.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t.dashboard.noCourses}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link href={`/courses/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ backgroundColor: c.color }} />
                    <span className="num w-20 shrink-0 text-[13px] font-extrabold text-slate-600">{c.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{c.title}</span>
                    {c.department_id ? <span className="hidden truncate text-[13px] text-slate-500 sm:inline">{deptName.get(c.department_id)}</span> : null}
                    {c.level ? <Badge>{c.level}</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Link href="/admin/people" className="block">
            <Card lifted className="flex items-center gap-4 p-5 transition-colors hover:border-ardoise">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ardoise text-chalk">
                <Users size={20} aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-display text-xl font-semibold">{t.staffing.title}</p>
                <p className="text-[14px] text-slate-600">
                  {staffCount} {t.home.staff.toLowerCase()} · {t.staffing.invite}
                </p>
              </div>
            </Card>
          </Link>
          <Link href="/admin/students" className="block">
            <Card lifted className="flex items-center gap-4 p-5 transition-colors hover:border-ardoise">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ochre-500 text-[#12100C]">
                <ClipboardList size={20} aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-display text-xl font-semibold">{t.roster.title}</p>
                <p className="text-[14px] text-slate-600">
                  {fmt(t.roster.signedUp, { n: rosterLinked ?? 0, total: rosterTotal ?? 0 })}
                  {claimCount ? ` · ${fmt(t.home.claimsWaiting, { n: claimCount })}` : ""}
                </p>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
