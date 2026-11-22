import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";
import type { Membership } from "@/lib/session";
import { fmt } from "@/lib/i18n/messages-engage";
import type { Messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/messages";
import { Avatar, Button, Card, Input, Select } from "@/components/ui";
import { createDepartmentCourse } from "@/app/(app)/dashboard/actions";

type Client = Awaited<ReturnType<typeof createClient>>;
type Dept = { id: string; name: string; faculty_id: string | null };
type CourseRow = { id: string; code: string; title: string; color: string; level: string | null; department_id: string };
type EnrollRow = {
  course_id: string;
  user_id: string;
  role: string;
  profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

/** Deans and heads of department: their departments, courses, teachers and students. */
export async function DepartmentPanel({
  supabase,
  institutionId,
  memberships,
  t,
  locale,
}: {
  supabase: Client;
  institutionId: string;
  memberships: Membership[];
  t: Messages;
  locale: Locale;
}) {
  const hodDepts = memberships.filter((m) => m.role === "hod" && m.department_id).map((m) => m.department_id!);
  const deanFacs = memberships.filter((m) => m.role === "dean" && m.faculty_id).map((m) => m.faculty_id!);
  const [{ data: deps }, { data: facs }] = await Promise.all([
    supabase.from("departments").select("id, name, faculty_id").eq("institution_id", institutionId).order("name"),
    supabase.from("faculties").select("id, name").eq("institution_id", institutionId),
  ]);
  const facName = new Map(((facs ?? []) as Array<{ id: string; name: string }>).map((f) => [f.id, f.name]));
  const scope = ((deps ?? []) as Dept[]).filter((d) => hodDepts.includes(d.id) || (d.faculty_id && deanFacs.includes(d.faculty_id)));
  if (!scope.length) return null;

  const { data: courseData } = await supabase
    .from("courses")
    .select("id, code, title, color, level, department_id")
    .in("department_id", scope.map((d) => d.id))
    .order("code");
  const courses = (courseData ?? []) as CourseRow[];
  const { data: enrollData } = courses.length
    ? await supabase
        .from("enrollments")
        .select("course_id, user_id, role, profile:profiles(full_name, email)")
        .in("course_id", courses.map((c) => c.id))
    : { data: [] };
  const enrolls = (enrollData ?? []) as EnrollRow[];
  const name = (e: EnrollRow) => {
    const p = Array.isArray(e.profile) ? e.profile[0] : e.profile;
    return p?.full_name || p?.email || "";
  };

  return (
    <section className="mb-8 space-y-6">
      {scope.map((d) => {
        const mine = courses.filter((c) => c.department_id === d.id);
        const teachers = new Map<string, string>();
        for (const e of enrolls) if (e.role !== "student" && mine.some((c) => c.id === e.course_id)) teachers.set(e.user_id, name(e));
        const students = new Set(enrolls.filter((e) => e.role === "student" && mine.some((c) => c.id === e.course_id)).map((e) => e.user_id));
        return (
          <Card key={d.id}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/70 px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ardoise text-chalk">
                <Building2 size={19} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl font-semibold">{d.name}</h2>
                <p className="text-[13.5px] text-slate-500">
                  {d.faculty_id ? `${facName.get(d.faculty_id)} · ` : ""}
                  {mine.length} {t.home.deptCourses.toLowerCase()} · {teachers.size} {t.home.deptTeachers.toLowerCase()} ·{" "}
                  {fmt(t.home.studentsCount, { n: students.size })}
                </p>
              </div>
              <details className="group relative">
                <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-[10px] bg-ardoise px-4 text-[14.5px] font-semibold text-chalk hover:bg-brand-600">
                  <Plus size={16} aria-hidden />
                  {t.home.newCourse}
                </summary>
                <form
                  action={createDepartmentCourse}
                  className="absolute right-0 z-10 mt-2 grid w-[min(92vw,360px)] gap-3 rounded-2xl border border-slate-200 bg-paper p-4 shadow-float"
                >
                  <input type="hidden" name="institution_id" value={institutionId} />
                  <input type="hidden" name="department_id" value={d.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input name="code" required placeholder="INF101" aria-label={t.admin.code} />
                    <Input name="level" placeholder="L1" aria-label={t.admin.level} />
                  </div>
                  <Input name="title" required placeholder={t.admin.courseTitle} aria-label={t.admin.courseTitle} />
                  <Select name="language" defaultValue={locale} aria-label={t.admin.language}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </Select>
                  <Button type="submit">{t.admin.newCourse}</Button>
                </form>
              </details>
            </div>
            {mine.length === 0 ? (
              <p className="px-5 py-5 text-[14.5px] text-slate-500">{t.home.noCourses}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {mine.map((c) => {
                  const ts = enrolls.filter((e) => e.course_id === c.id && e.role !== "student");
                  const n = enrolls.filter((e) => e.course_id === c.id && e.role === "student").length;
                  return (
                    <li key={c.id}>
                      <Link href={`/courses/${c.id}`} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-50 sm:grid-cols-[auto_88px_1fr_1.2fr_auto]">
                        <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ backgroundColor: c.color }} />
                        <span className="num text-[13.5px] font-extrabold text-slate-600">{c.code}</span>
                        <span className="col-start-2 truncate text-[15px] font-semibold text-slate-900 sm:col-start-auto">{c.title}</span>
                        <span className="col-start-2 flex flex-wrap gap-1 sm:col-start-auto">
                          {ts.length ? (
                            ts.map((e) => (
                              <span key={e.user_id} className="inline-flex items-center gap-1.5 text-[13.5px] text-slate-700">
                                <Avatar name={name(e)} size={20} />
                                {name(e)}
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[12.5px] font-bold text-terracotta-600">{t.home.noTeacher}</span>
                          )}
                        </span>
                        <span className="col-start-2 text-[13.5px] text-slate-500 sm:col-start-auto">{fmt(t.home.studentsCount, { n })}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {teachers.size ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
                <span className="text-[13px] font-semibold text-slate-500">{t.home.deptTeachers}</span>
                {[...teachers.values()].sort((a, b) => a.localeCompare(b, locale)).map((n) => (
                  <span key={n} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[13px] font-semibold text-brand-700">
                    {n}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}
    </section>
  );
}
