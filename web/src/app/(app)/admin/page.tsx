import Link from "next/link";
import type { Metadata } from "next";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Badge, Button, Card, CardHeader, Field, Flash, Input, Select } from "@/components/ui";
import type { Course, InstitutionRole } from "@/lib/types";
import { addMember, createCourse } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.title };
}

type MemberRow = {
  user_id: string;
  role: InstitutionRole;
  profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const [{ supabase, institution, isAdminOrRegistrar, isAdmin }, { t, locale }] = await Promise.all([
    requireInstitution(),
    getI18n(),
  ]);
  const { error, ok } = await searchParams;

  if (!isAdminOrRegistrar) return null;

  const [{ data: courseData }, { data: memberData }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, institution_id, code, title, description, language, level, color, published")
      .eq("institution_id", institution.id)
      .order("code"),
    supabase
      .from("memberships")
      .select("user_id, role, profile:profiles(full_name, email)")
      .eq("institution_id", institution.id),
  ]);
  const courses = (courseData ?? []) as Course[];

  const members = new Map<string, { name: string; email: string; roles: InstitutionRole[] }>();
  for (const row of (memberData ?? []) as MemberRow[]) {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const entry = members.get(row.user_id) ?? { name: p?.full_name || p?.email || "", email: p?.email ?? "", roles: [] };
    entry.roles.push(row.role);
    members.set(row.user_id, entry);
  }
  const memberList = [...members.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, locale));

  return (
    <>
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${t.admin.courses} (${courses.length})`} />
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
            <Field label={`${t.admin.teacherEmail} (${t.common.optional})`}>
              <Input name="teacher_email" type="email" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">{t.admin.newCourse}</Button>
            </div>
          </form>
          {courses.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t.dashboard.noCourses}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link href={`/courses/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{c.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{c.title}</span>
                    {c.level ? <Badge>{c.level}</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`${t.admin.members} (${memberList.length})`} />
          <form action={addMember} className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <input type="hidden" name="institution_id" value={institution.id} />
            <Field label={t.common.email}>
              <Input name="email" type="email" required />
            </Field>
            <Field label={t.common.role}>
              <Select name="role" defaultValue="student">
                <option value="student">{t.admin.roles.student}</option>
                <option value="teacher">{t.admin.roles.teacher}</option>
                <option value="registrar">{t.admin.roles.registrar}</option>
                {isAdmin ? <option value="admin">{t.admin.roles.admin}</option> : null}
              </Select>
            </Field>
            <Button type="submit">{t.common.add}</Button>
          </form>
          <ul className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto">
            {memberList.map(([id, m]) => (
              <li key={id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{m.name}</p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {m.roles.map((r) => (
                    <Badge key={r} tone={r === "student" ? "info" : "brand"}>
                      {t.admin.roles[r]}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
