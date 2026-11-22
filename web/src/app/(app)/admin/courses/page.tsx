import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Badge, Button, Card, Field, Flash, Input, Select } from "@/components/ui";
import { fmt } from "@/lib/i18n/messages-engage";
import { createCourse } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav2.courses };
}

const PAGE = 50;

type Row = {
  id: string;
  code: string;
  title: string;
  department: string | null;
  level: string | null;
  color: string;
  lecturers: string;
  students: number;
  total: number;
};

/** Every course of the university, searched and paged: hundreds of courses never load at once. */
export default async function AdminCoursesPage({ searchParams }: PageProps<"/admin/courses">) {
  const [{ supabase, institution, can }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.manageStudents) redirect("/admin/people");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const dept = typeof sp.d === "string" && /^[0-9a-f-]{36}$/.test(sp.d) ? sp.d : "";
  const page = Math.max(1, Number(sp.p) || 1);

  const [{ data }, { data: depData }] = await Promise.all([
    supabase.rpc("admin_courses", {
      p_institution: institution.id,
      p_query: q,
      p_department: dept || null,
      p_offset: (page - 1) * PAGE,
      p_limit: PAGE,
    }),
    supabase.from("departments").select("id, name").eq("institution_id", institution.id).order("name"),
  ]);
  const rows = (data ?? []) as Row[];
  const total = rows[0] ? Number(rows[0].total) : 0;
  const departments = (depData ?? []) as Array<{ id: string; name: string }>;
  const from = total ? (page - 1) * PAGE + 1 : 0;
  const to = (page - 1) * PAGE + rows.length;
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dept) params.set("d", dept);
    if (p > 1) params.set("p", String(p));
    const s = params.toString();
    return (s ? `/admin/courses?${s}` : "/admin/courses") as "/admin/courses";
  };
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="space-y-5">
      <Flash error={errorText(t, error)} />

      <form className="flex flex-wrap items-end gap-2" role="search">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={q} placeholder={t.adminCourses.search} aria-label={t.adminCourses.search} className="pl-9" />
        </div>
        <Select name="d" defaultValue={dept} aria-label={t.staffing.department} className="w-auto min-w-[12rem]">
          <option value="">{t.adminCourses.allDepartments}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t.teach.searchButton}
        </Button>
      </form>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-[14px] text-slate-600">
          <span className="font-semibold text-slate-900">{fmt(t.adminCourses.count, { n: total })}</span>
          {total ? <span>{fmt(t.adminCourses.showing, { from, to, n: total })}</span> : null}
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[14.5px] text-slate-500">{t.adminCourses.none}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/courses/${c.id}`} className="grid gap-x-4 gap-y-0.5 px-5 py-3 hover:bg-slate-50 sm:grid-cols-[6.5rem_1fr_auto]">
                  <span className="num text-[13.5px] font-extrabold" style={{ color: c.color }}>
                    {c.code}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-slate-900">{c.title}</span>
                    <span className="block truncate text-[13px] text-slate-500">
                      {[c.department, c.lecturers || t.adminCourses.noLecturer].filter(Boolean).join(" — ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-[13px] text-slate-600">
                    {c.level ? <Badge>{c.level}</Badge> : null}
                    {fmt(t.adminCourses.students, { n: c.students.toLocaleString(locale) })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > PAGE ? (
          <nav className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[14px] font-semibold">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                <ChevronLeft size={15} aria-hidden />
                {t.adminCourses.previous}
              </Link>
            ) : (
              <span />
            )}
            {to < total ? (
              <Link href={pageHref(page + 1)} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                {t.adminCourses.next}
                <ChevronRight size={15} aria-hidden />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </Card>

      {can.manageSchool ? (
        <details className="group rounded-[var(--radius-card)] border border-slate-200 bg-paper">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
            <Plus size={17} aria-hidden className="text-brand-600 transition-transform group-open:rotate-45" />
            {t.adminCourses.addByHand}
          </summary>
          <form action={createCourse} className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-2">
            <p className="text-[14px] text-slate-600 sm:col-span-2">{t.adminCourses.addByHandHelp}</p>
            <input type="hidden" name="institution_id" value={institution.id} />
            <Field label={t.admin.code}>
              <Input name="code" required placeholder="CSC201" />
            </Field>
            <Field label={t.admin.level}>
              <Input name="level" placeholder="200" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.admin.courseTitle}>
                <Input name="title" required />
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
        </details>
      ) : null}
    </div>
  );
}
