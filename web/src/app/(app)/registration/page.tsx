import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInstitution } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { FormBUpload } from "@/components/registration/form-b-upload";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.formB.title };
}

type Reg = { course_code: string; semester: { label: string; starts_on: string | null; academic_year_id: string } | { label: string; starts_on: string | null; academic_year_id: string }[] | null };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** A student registers the year's courses from their Form B, and sees what they're registered for. */
export default async function RegistrationPage() {
  const [{ supabase, user, roles, institution }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!roles.includes("student")) redirect("/dashboard");
  const f = t.formB;

  const { data: roster } = await supabase
    .from("student_roster")
    .select("id")
    .eq("institution_id", institution.id)
    .eq("claimed_by", user.id)
    .maybeSingle();
  const [{ data: regs }, { data: uploads }, { data: currentSem }, { data: mine }] = await Promise.all([
    roster
      ? supabase.from("roster_courses").select("course_code, semester:semesters(label, starts_on, academic_year_id)").eq("roster_id", roster.id)
      : Promise.resolve({ data: [] as Reg[] }),
    supabase.from("form_b_uploads").select("updated_at").eq("student_id", user.id).order("updated_at", { ascending: false }).limit(1),
    supabase.rpc("current_semester", { inst: institution.id }),
    supabase.from("enrollments").select("course:courses(id, code, semester_id)").eq("user_id", user.id).eq("role", "student"),
  ]);
  const { data: sem } = currentSem
    ? await supabase.from("semesters").select("academic_year_id").eq("id", currentSem as string).maybeSingle()
    : { data: null };
  const thisYear = ((regs ?? []) as Reg[])
    .map((r) => ({ code: r.course_code, sem: one(r.semester) }))
    .filter((r) => r.sem && r.sem.academic_year_id === sem?.academic_year_id)
    .sort((a, b) => (a.sem!.starts_on ?? "").localeCompare(b.sem!.starts_on ?? "") || a.code.localeCompare(b.code));
  const { data: titles } = thisYear.length
    ? await supabase.from("catalogue_courses").select("code, title, credits").eq("institution_id", institution.id).in("code", thisYear.map((r) => r.code.toUpperCase()))
    : { data: [] };
  const byCode = new Map(((titles ?? []) as Array<{ code: string; title: string; credits: number | null }>).map((c) => [c.code, c]));
  const openByCode = new Map(
    ((mine ?? []) as Array<{ course: { id: string; code: string } | { id: string; code: string }[] | null }>)
      .map((e) => one(e.course))
      .filter((c): c is { id: string; code: string } => !!c)
      .map((c) => [c.code.toUpperCase(), c.id]),
  );
  const last = (uploads ?? [])[0] as { updated_at: string } | undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={f.title} subtitle={f.intro} />
      <FormBUpload
        labels={{
          choose: f.choose,
          reading: f.reading,
          photoNote: f.photoNote,
          matriculeOk: f.matriculeOk,
          yearOk: f.yearOk,
          yearUnknown: f.yearUnknown,
          found: f.found,
          statusIn: f.statusIn,
          statusJoins: f.statusJoins,
          statusWaiting: f.statusWaiting,
          unknown: f.unknown,
          dropNote: f.dropNote,
          register: f.register,
          registering: f.registering,
          done: f.done,
          credits: f.credits,
          errors: f.errors,
        }}
      />
      <Card>
        <CardHeader title={f.current} />
        {thisYear.length ? (
          <ul className="divide-y divide-slate-100">
            {thisYear.map((r) => {
              const c = byCode.get(r.code.toUpperCase());
              const open = openByCode.get(r.code.toUpperCase());
              const label = (
                <>
                  <span className="w-24 shrink-0 font-semibold text-brand-600">{r.code}</span>
                  <span className="min-w-0 flex-1 text-slate-800">{c?.title ?? ""}</span>
                  <span className="text-[13px] text-slate-500">
                    {[r.sem?.label, c?.credits ? fmt(f.credits, { n: Number(c.credits) }) : null].filter(Boolean).join(" · ")}
                  </span>
                </>
              );
              return (
                <li key={`${r.code}-${r.sem?.label}`}>
                  {open ? (
                    <Link href={`/courses/${open}`} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 text-[14.5px] hover:bg-slate-50">
                      {label}
                    </Link>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5 text-[14.5px]">{label}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-5 text-[15px] text-slate-500">{f.none}</p>
        )}
        {last ? <p className="border-t border-slate-100 px-5 py-3 text-[13px] text-slate-500">{fmt(f.lastUpload, { date: formatDate(locale, last.updated_at) })}</p> : null}
      </Card>
    </div>
  );
}
