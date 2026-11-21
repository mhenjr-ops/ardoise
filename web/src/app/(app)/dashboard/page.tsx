import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, ClipboardCheck } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { daysFromNowIso, formatDateTime, isPast } from "@/lib/format";
import { Badge, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import type { Assignment, Course, CourseRole } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dashboard.title };
}

type EnrollmentRow = { role: CourseRole; course: Course | Course[] | null };

export default async function DashboardPage() {
  const [{ supabase, user, institution, isAdminOrRegistrar, profile }, { t, locale }] = await Promise.all([
    requireInstitution(),
    getI18n(),
  ]);

  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("role, course:courses(id, institution_id, code, title, description, language, level, color, published)")
    .eq("user_id", user.id);

  const byId = new Map<string, { course: Course; role: CourseRole | "admin" }>();
  for (const row of (enrollmentRows ?? []) as EnrollmentRow[]) {
    const course = Array.isArray(row.course) ? row.course[0] : row.course;
    if (course) byId.set(course.id, { course, role: row.role });
  }

  // Admins and registrars also see every course of their institution.
  if (isAdminOrRegistrar) {
    const { data: allCourses } = await supabase
      .from("courses")
      .select("id, institution_id, code, title, description, language, level, color, published")
      .eq("institution_id", institution.id)
      .order("code");
    for (const course of (allCourses ?? []) as Course[]) {
      if (!byId.has(course.id)) byId.set(course.id, { course, role: "admin" });
    }
  }

  const cards = [...byId.values()].sort((a, b) => a.course.code.localeCompare(b.course.code));
  const studentCourseIds = cards.filter((c) => c.role === "student").map((c) => c.course.id);
  const staffCourseIds = cards.filter((c) => c.role !== "student").map((c) => c.course.id);

  // Student to-do: published work due from a week ago onward, not yet submitted.
  let todo: Array<Assignment & { courseCode: string }> = [];
  if (studentCourseIds.length) {
    const since = daysFromNowIso(-7);
    const { data: upcoming } = await supabase
      .from("assignments")
      .select("id, course_id, title, description, due_at, points_possible, submission_types, component, weight, published, created_at")
      .in("course_id", studentCourseIds)
      .eq("published", true)
      .gte("due_at", since)
      .order("due_at", { ascending: true })
      .limit(20);
    const list = (upcoming ?? []) as Assignment[];
    const { data: mine } = list.length
      ? await supabase
          .from("submissions")
          .select("assignment_id")
          .eq("student_id", user.id)
          .in(
            "assignment_id",
            list.map((a) => a.id),
          )
      : { data: [] };
    const { data: quizDone } = list.length
      ? await supabase
          .from("quiz_attempts")
          .select("assignment_id")
          .eq("student_id", user.id)
          .not("submitted_at", "is", null)
          .in(
            "assignment_id",
            list.map((a) => a.id),
          )
      : { data: [] };
    const done = new Set(
      [...(mine ?? []), ...(quizDone ?? [])].map((s: { assignment_id: string }) => s.assignment_id),
    );
    todo = list
      .filter((a) => !done.has(a.id))
      .map((a) => ({ ...a, courseCode: byId.get(a.course_id)?.course.code ?? "" }));
  }

  // Staff to-do: submissions waiting for a mark, per course.
  const toGrade = new Map<string, number>();
  if (staffCourseIds.length) {
    const [{ data: subs }, { data: grades }] = await Promise.all([
      supabase.from("submissions").select("course_id, assignment_id, student_id").in("course_id", staffCourseIds),
      supabase.from("grades").select("assignment_id, student_id, score").in("course_id", staffCourseIds),
    ]);
    const graded = new Set(
      (grades ?? [])
        .filter((g: { score: number | null }) => g.score !== null)
        .map((g: { assignment_id: string; student_id: string }) => `${g.assignment_id}:${g.student_id}`),
    );
    for (const s of (subs ?? []) as Array<{ course_id: string; assignment_id: string; student_id: string }>) {
      if (!graded.has(`${s.assignment_id}:${s.student_id}`)) {
        toGrade.set(s.course_id, (toGrade.get(s.course_id) ?? 0) + 1);
      }
    }
  }

  const firstName = (profile.full_name || "").split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `${t.dashboard.title} · ${firstName}` : t.dashboard.title} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.myCourses}</h2>
          {cards.length === 0 ? (
            <Empty>{t.dashboard.noCourses}</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ course, role }) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="h-24 p-4" style={{ backgroundColor: course.color }}>
                    <span className="rounded bg-black/20 px-2 py-0.5 text-xs font-semibold text-white">
                      {course.code}
                    </span>
                  </div>
                  <div className="space-y-2 p-4">
                    <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700">
                      {course.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={role === "student" ? "info" : "brand"}>
                        {role === "student" ? t.dashboard.student : t.dashboard.teaching}
                      </Badge>
                      {course.level ? <Badge>{course.level}</Badge> : null}
                      {toGrade.get(course.id) ? (
                        <Badge tone="warn">
                          {toGrade.get(course.id)} {t.dashboard.toGrade}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside>
          <Card>
            <CardHeader title={t.dashboard.todo} />
            {todo.length === 0 && toGrade.size === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t.dashboard.nothingDue}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {todo.map((a) => (
                  <li key={a.id}>
                    <Link href={`/courses/${a.course_id}/assignments/${a.id}`} className="flex gap-3 px-5 py-3 hover:bg-slate-50">
                      <CalendarClock size={18} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{a.title}</span>
                        <span className={`block text-xs ${isPast(a.due_at) ? "text-red-600" : "text-slate-500"}`}>
                          {a.courseCode} · {formatDateTime(locale, a.due_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {[...toGrade.entries()].map(([courseId, count]) => (
                  <li key={courseId}>
                    <Link href={`/courses/${courseId}/assignments`} className="flex gap-3 px-5 py-3 hover:bg-slate-50">
                      <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                      <span className="text-sm">
                        <span className="font-medium">{byId.get(courseId)?.course.code}</span> · {count} {t.dashboard.toGrade}
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
