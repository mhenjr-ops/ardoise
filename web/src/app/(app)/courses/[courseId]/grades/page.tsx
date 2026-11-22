import Link from "next/link";
import { Download } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { formatScore } from "@/lib/format";
import { toTwenty, weightedAverage } from "@/lib/grades";
import { Card, Empty, buttonClass } from "@/components/ui";
import { WhatIfGrades } from "@/components/grading/what-if";
import type { Assignment, Grade } from "@/lib/types";

type StudentRow = { user_id: string; profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null };

export default async function GradesPage({ params }: PageProps<"/courses/[courseId]/grades">) {
  const { courseId } = await params;
  const [{ supabase, course, isStaff, canSeeStaffViews, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const [{ data: aData }, { data: gData }, { data: sData }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, course_id, title, description, due_at, points_possible, submission_types, component, weight, published, created_at")
      .eq("course_id", course.id)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("grades").select("id, assignment_id, student_id, score, comment, graded_at").eq("course_id", course.id),
    canSeeStaffViews
      ? supabase.from("enrollments").select("user_id, profile:profiles(full_name, email)").eq("course_id", course.id).eq("role", "student")
      : Promise.resolve({ data: [] }),
  ]);
  const assignments = (aData ?? []) as Assignment[];
  const grades = (gData ?? []) as Grade[];

  if (assignments.length === 0) return <Empty>{t.grades.noGrades}</Empty>;

  if (!canSeeStaffViews) {
    const rows = assignments.map((a) => {
      const g = grades.find((row) => row.assignment_id === a.id && row.student_id === user.id);
      return {
        id: a.id,
        href: `/courses/${course.id}/assignments/${a.id}`,
        title: a.title,
        component: t.assignments.components[a.component],
        weight: Number(a.weight),
        points: Number(a.points_possible),
        score: g && g.score !== null ? Number(g.score) : null,
        comment: g?.comment ?? null,
      };
    });
    return (
      <WhatIfGrades
        rows={rows}
        locale={locale}
        labels={{
          average: t.whatif.current,
          projected: t.whatif.projected,
          note: t.grades.weightNote,
          title: t.whatif.title,
          help: t.whatif.help,
          reset: t.whatif.reset,
          notGraded: t.grades.notGraded,
          feedback: t.assignments.feedback,
        }}
      />
    );
  }

  const students = ((sData ?? []) as StudentRow[])
    .map((row) => {
      const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { id: row.user_id, name: p?.full_name || p?.email || row.user_id };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t.grades.weightNote}</p>
        <a href={`/courses/${course.id}/grades/export`} className={buttonClass("secondary", "sm")}>
          <Download size={14} aria-hidden />
          {t.grades.export}
        </a>
      </div>
      {students.length === 0 ? (
        <Empty>{t.grader.noStudents}</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-semibold text-slate-700">{t.grades.student}</th>
                {assignments.map((a) => (
                  <th key={a.id} className="min-w-28 px-3 py-3 font-medium text-slate-600">
                    {isStaff ? (
                      <Link href={`/courses/${course.id}/assignments/${a.id}/grade`} className="hover:text-brand-700">
                        <span className="line-clamp-2">{a.title}</span>
                      </Link>
                    ) : (
                      <span className="line-clamp-2">{a.title}</span>
                    )}
                    <span className="block text-xs font-normal text-slate-400">
                      /{formatScore(locale, a.points_possible)} · ×{formatScore(locale, a.weight)}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold text-slate-700">
                  {t.grades.average} {t.grades.outOf20}
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const avg = weightedAverage(assignments, grades, s.id);
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-paper px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                    {assignments.map((a) => {
                      const g = grades.find((row) => row.assignment_id === a.id && row.student_id === s.id);
                      const low = g && g.score !== null && toTwenty(Number(g.score), Number(a.points_possible)) < 10;
                      return (
                        <td key={a.id} className={`px-3 py-2.5 num ${low ? "font-bold text-terracotta-600" : "text-slate-700"}`}>
                          {isStaff ? (
                            <Link href={`/courses/${course.id}/assignments/${a.id}/grade?student=${s.id}`} className="block hover:underline">
                              {g && g.score !== null ? formatScore(locale, g.score) : "–"}
                            </Link>
                          ) : g && g.score !== null ? (
                            formatScore(locale, g.score)
                          ) : (
                            "–"
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={`px-4 py-2.5 text-right num font-display text-[16px] font-semibold ${
                        avg !== null && avg < 10 ? "text-red-600" : "text-slate-900"
                      }`}
                    >
                      {formatScore(locale, avg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
