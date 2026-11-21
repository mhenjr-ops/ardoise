import { redirect } from "next/navigation";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
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
  const [{ supabase, course, isStaff, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}`);

  const { data } = await supabase
    .from("enrollments")
    .select("user_id, role, profile:profiles(full_name, email)")
    .eq("course_id", course.id);
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
      <Card className="p-5">
        <form action={enrollPerson} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <input type="hidden" name="course_id" value={course.id} />
          <Field label={t.common.email} hint={t.people.addHelp}>
            <Input name="email" type="email" required placeholder="etudiant@exemple.cm" />
          </Field>
          <Field label={t.common.role}>
            <Select name="role" defaultValue="student">
              <option value="student">{t.people.roles.student}</option>
              <option value="ta">{t.people.roles.ta}</option>
              <option value="teacher">{t.people.roles.teacher}</option>
            </Select>
          </Field>
          <Button type="submit" className="sm:mb-5">
            {t.people.add}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-500">{p.email}</p>
              </div>
              <Badge tone={p.role === "student" ? "info" : "brand"}>{t.people.roles[p.role]}</Badge>
              {p.id !== user.id ? (
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
    </div>
  );
}
