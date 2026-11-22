import { redirect } from "next/navigation";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { Badge, Button, Card, Field, Flash, Input, Select } from "@/components/ui";
import type { CourseRole } from "@/lib/types";
import { enrollPerson, unenroll } from "./actions";

type Row = {
  user_id: string;
  role: CourseRole;
  profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export default async function PeoplePage({ params, searchParams }: PageProps<"/courses/[courseId]/people">) {
  const { courseId } = await params;
  const { error, ok } = await searchParams;
  const [{ supabase, course, isStaff, canStaff, canSeeStaffViews, user }, { t, locale }] = await Promise.all([
    getCourseContext(courseId),
    getI18n(),
  ]);
  if (!canSeeStaffViews) redirect(`/courses/${courseId}`);
  // Teachers manage the students of their course; the school (admin, registrar, dean, head)
  // assigns teachers. Readers without either power just see the list.
  const canAdd = isStaff || canStaff;
  const removable = (role: CourseRole) => canStaff || (isStaff && role === "student");

  const [{ data }, { data: regs }] = await Promise.all([
    supabase.from("enrollments").select("user_id, role, profile:profiles(full_name, email)").eq("course_id", course.id),
    supabase.rpc("course_registrations", { p_course: course.id }),
  ]);
  // The registrar's list: matricules for enrolled students, and who hasn't joined Ardoise yet.
  const registrations = (regs ?? []) as Array<{ matricule: string; full_name: string; user_id: string | null }>;
  const matriculeOf = new Map(registrations.filter((r) => r.user_id).map((r) => [r.user_id as string, r.matricule]));
  const waiting = registrations.filter((r) => !r.user_id);
  const order: Record<CourseRole, number> = { teacher: 0, ta: 1, student: 2 };
  const people = ((data ?? []) as Row[])
    .map((row) => {
      const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { id: row.user_id, role: row.role, name: p?.full_name || p?.email || "", email: p?.email ?? "" };
    })
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name, locale));

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />
      {canAdd ? (
      <Card className="p-5">
        <form action={enrollPerson} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <input type="hidden" name="course_id" value={course.id} />
          <Field label={t.common.email} hint={t.people.addHelp}>
            <Input name="email" type="email" required placeholder="etudiant@exemple.cm" />
          </Field>
          <Field label={t.common.role}>
            <Select name="role" defaultValue={canStaff && !isStaff ? "teacher" : "student"}>
              <option value="student">{t.people.roles.student}</option>
              {canStaff ? <option value="teacher">{t.people.roles.teacher}</option> : null}
            </Select>
          </Field>
          <Button type="submit" className="sm:mb-5">
            {t.people.add}
          </Button>
        </form>
      </Card>
      ) : null}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {matriculeOf.get(p.id) ? <span className="num mr-2 font-semibold text-slate-600">{matriculeOf.get(p.id)}</span> : null}
                  {p.email}
                </p>
              </div>
              <Badge tone={p.role === "student" ? "info" : "brand"}>{t.people.roles[p.role]}</Badge>
              {p.id !== user.id && removable(p.role) ? (
                <form action={unenroll}>
                  <input type="hidden" name="course_id" value={course.id} />
                  <input type="hidden" name="user_id" value={p.id} />
                  <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                    {t.modules.remove}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {waiting.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-3.5">
            <h2 className="text-[15px] font-bold text-slate-900">{fmt(t.teach.waitingTitle, { n: waiting.length })}</h2>
            <p className="text-[13px] text-slate-500">{t.teach.waitingHelp}</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {waiting.map((w) => (
              <li key={w.matricule} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="num w-28 shrink-0 font-semibold text-slate-600">{w.matricule}</span>
                <span className="truncate text-slate-700">{w.full_name}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
