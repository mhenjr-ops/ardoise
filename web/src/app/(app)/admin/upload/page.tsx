import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { Card } from "@/components/ui";
import { RosterImport } from "@/components/admin/roster-import";
import { importRoster } from "../students/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.roster.importTitle };
}

/** The registrar's (or administrator's) one upload: courses, students and registrations from Excel. */
export default async function UploadPage() {
  const [{ supabase, institution, can }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.manageStudents) redirect("/admin/people");
  const [{ data: sems }, { data: currentSem }] = await Promise.all([
    supabase
      .from("semesters")
      .select("id, label, starts_on, year:academic_years(label)")
      .eq("institution_id", institution.id)
      .order("starts_on", { ascending: false, nullsFirst: false }),
    supabase.rpc("current_semester", { inst: institution.id }),
  ]);
  const semesters = ((sems ?? []) as Array<{ id: string; label: string; year: { label: string } | { label: string }[] | null }>).map((s) => {
    const y = Array.isArray(s.year) ? s.year[0] : s.year;
    return { id: s.id, label: y ? `${s.label} · ${y.label}` : s.label };
  });

  return (
    <Card className="mx-auto max-w-3xl p-6">
      <h2 className="font-display text-2xl font-semibold">{t.roster.importTitle}</h2>
      <p className="mb-3 mt-1.5 text-[15px] leading-relaxed text-slate-600">{t.roster.importBody}</p>
      <p className="mb-3 text-[13.5px] text-slate-500">{t.roster.columns}</p>
      <a
        href="/templates/ardoise-student-list.xlsx"
        download
        className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline"
      >
        <Download size={15} aria-hidden />
        {t.roster.template}
      </a>
      <RosterImport
        institutionId={institution.id}
        action={importRoster}
        semesters={semesters}
        currentSemester={(currentSem as string | null) ?? null}
        labels={{
          chooseFile: t.roster.chooseFile,
          reading: t.roster.reading,
          found: t.roster.found,
          sheets: t.roster.sheets,
          detected: t.roster.detected,
          noData: t.roster.noData,
          badFile: t.roster.badFile,
          import: t.roster.importAll,
          progress: t.roster.progress,
          result: t.roster.result,
          unknownCourses: t.roster.unknownCourses,
          coursesCreated: t.roster.coursesCreated,
          semester: t.roster.semester,
          columnNames: t.roster.columnNames,
          error: t.errors.generic,
        }}
      />
      <p className="mt-5 border-t border-slate-100 pt-4 text-[13.5px] text-slate-500">
        <Link href="/admin/enrollments" className="font-semibold text-brand-600 hover:underline">
          {t.roster.fixEnrollment}
        </Link>
      </p>
    </Card>
  );
}
