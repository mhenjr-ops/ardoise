import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Mail } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatScore, nowMs } from "@/lib/format";
import { weightedAverage } from "@/lib/grades";
import { Avatar, Card, CardHeader, Stat, cx } from "@/components/ui";

const BUCKETS = [
  { from: 0, to: 5, label: "0–5" },
  { from: 5, to: 8, label: "5–8" },
  { from: 8, to: 10, label: "8–10" },
  { from: 10, to: 12, label: "10–12" },
  { from: 12, to: 14, label: "12–14" },
  { from: 14, to: 16, label: "14–16" },
  { from: 16, to: 20.01, label: "16–20" },
];

export default async function AnalyticsPage({ params }: PageProps<"/courses/[courseId]/analytics">) {
  const { courseId } = await params;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}`);
  const now = nowMs();

  const [{ data: studentRows }, { data: asg }, { data: grades }, { data: subs }, { data: attempts }, { data: att }] = await Promise.all([
    supabase.from("enrollments").select("user_id, profile:profiles(full_name, email)").eq("course_id", course.id).eq("role", "student"),
    supabase.from("assignments").select("id, title, due_at, points_possible, weight, published").eq("course_id", course.id).eq("published", true).order("due_at"),
    supabase.from("grades").select("assignment_id, student_id, score").eq("course_id", course.id),
    supabase.from("submissions").select("assignment_id, student_id").eq("course_id", course.id),
    supabase.from("quiz_attempts").select("assignment_id, student_id").eq("course_id", course.id).not("submitted_at", "is", null),
    supabase.from("attendance_records").select("student_id, status").eq("course_id", course.id),
  ]);
  const students = (studentRows ?? []).map((r) => {
    const p = (Array.isArray(r.profile) ? r.profile[0] : r.profile) as { full_name: string; email: string } | null;
    return { id: r.user_id as string, name: p?.full_name || p?.email || "?" };
  });
  const assignments = (asg ?? []) as Array<{ id: string; title: string; due_at: string | null; points_possible: number; weight: number }>;
  const gradeRows = (grades ?? []) as Array<{ assignment_id: string; student_id: string; score: number | null }>;
  const handed = new Set(
    [...(subs ?? []), ...(attempts ?? []), ...gradeRows.filter((g) => g.score !== null)].map(
      (r: { assignment_id: string; student_id: string }) => `${r.assignment_id}:${r.student_id}`,
    ),
  );
  const pastDue = assignments.filter((a) => a.due_at && new Date(a.due_at).getTime() < now);

  const rows = students
    .map((s) => {
      const avg = weightedAverage(assignments, gradeRows, s.id);
      const mine = (att ?? []).filter((r) => r.student_id === s.id);
      const rate = mine.length ? mine.filter((r) => r.status !== "absent").length / mine.length : null;
      const missing = pastDue.filter((a) => !handed.has(`${a.id}:${s.id}`)).length;
      const reasons: string[] = [];
      if (avg !== null && avg < 10) reasons.push(fmt(t.analytics.reasons.average, { v: formatScore(locale, avg) }));
      if (rate !== null && rate < 0.75) reasons.push(fmt(t.analytics.reasons.attendance, { v: `${Math.round(rate * 100)} %` }));
      if (missing >= 2) reasons.push(fmt(t.analytics.reasons.missing, { v: missing }));
      return { ...s, avg, rate, missing, reasons };
    })
    .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99));
  const atRisk = rows.filter((r) => r.reasons.length);
  const avgs = rows.map((r) => r.avg).filter((v): v is number => v !== null);
  const courseAvg = avgs.length ? avgs.reduce((s, v) => s + v, 0) / avgs.length : null;
  const rates = rows.map((r) => r.rate).filter((v): v is number => v !== null);
  const meanRate = rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : null;
  const totalMissing = rows.reduce((s, r) => s + r.missing, 0);
  const counts = BUCKETS.map((b) => avgs.filter((v) => v >= b.from && v < b.to).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.analytics.courseAverage} value={courseAvg === null ? "—" : formatScore(locale, Math.round(courseAvg * 100) / 100)} hint="/20" tone={courseAvg !== null && courseAvg < 10 ? "terracotta" : "ink"} />
        <Stat label={t.analytics.attendance} value={meanRate === null ? "—" : `${Math.round(meanRate * 100)} %`} tone={meanRate !== null && meanRate < 0.75 ? "terracotta" : "leaf"} />
        <Stat label={t.analytics.missing} value={totalMissing} tone={totalMissing ? "ochre" : "ink"} />
        <Stat label={t.analytics.atRisk} value={atRisk.length} tone={atRisk.length ? "terracotta" : "leaf"} />
      </div>

      <Card className={cx(atRisk.length > 0 && "border-terracotta-200")}>
        <CardHeader title={t.analytics.atRisk} icon={<AlertTriangle size={17} aria-hidden />} />
        <p className="px-5 pt-3 text-[13.5px] text-slate-500">{t.analytics.atRiskHelp}</p>
        {atRisk.length === 0 ? (
          <p className="px-5 py-5 text-[15px] text-leaf-700">{t.analytics.noneAtRisk}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {atRisk.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={r.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{r.name}</span>
                  <span className="flex flex-wrap gap-1.5 pt-0.5">
                    {r.reasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[12px] font-bold text-terracotta-600">
                        {reason}
                      </span>
                    ))}
                  </span>
                </span>
                <Link
                  href={`/inbox/new?to=${r.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:border-ardoise"
                >
                  <Mail size={14} aria-hidden />
                  {t.analytics.message}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.analytics.distribution} />
          <div className="flex h-52 items-end gap-2 px-5 pb-3 pt-6" role="img" aria-label={t.analytics.distribution}>
            {BUCKETS.map((b, i) => (
              <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="num text-[12px] font-bold text-slate-600">{counts[i] || ""}</span>
                <div
                  className={cx("w-full rounded-t-md", b.to <= 10 ? "bg-terracotta-400" : "bg-ardoise")}
                  style={{ height: `${(counts[i] / maxCount) * 100}%`, minHeight: counts[i] ? 6 : 2, opacity: counts[i] ? 1 : 0.2 }}
                />
                <span className="num text-[11.5px] font-semibold text-slate-500">{b.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t.analytics.submissionRate} />
          <ul className="space-y-3 px-5 py-4">
            {assignments.map((a) => {
              const n = students.filter((s) => handed.has(`${a.id}:${s.id}`)).length;
              const ratio = students.length ? n / students.length : 0;
              return (
                <li key={a.id}>
                  <div className="mb-1 flex justify-between gap-3 text-[13.5px]">
                    <Link href={`/courses/${course.id}/assignments/${a.id}/grade`} className="truncate font-semibold hover:underline">
                      {a.title}
                    </Link>
                    <span className="num shrink-0 font-bold text-slate-600">
                      {n}/{students.length}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={cx("h-full rounded-full", ratio < 0.6 ? "bg-ochre-500" : "bg-leaf-500")} style={{ width: `${ratio * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[14.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[12.5px] text-slate-500">
              <th className="px-5 py-2.5 font-bold">{t.grades.student}</th>
              <th className="px-3 py-2.5 text-right font-bold">{t.grades.average}</th>
              <th className="px-3 py-2.5 text-right font-bold">{t.attendance.rate}</th>
              <th className="px-5 py-2.5 text-right font-bold">{t.analytics.missing}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-2.5 font-semibold">{r.name}</td>
                <td className={cx("num px-3 py-2.5 text-right font-bold", r.avg !== null && r.avg < 10 && "text-terracotta-600")}>
                  {r.avg === null ? "—" : formatScore(locale, r.avg)}
                </td>
                <td className={cx("num px-3 py-2.5 text-right", r.rate !== null && r.rate < 0.75 && "font-bold text-terracotta-600")}>
                  {r.rate === null ? "—" : `${Math.round(r.rate * 100)} %`}
                </td>
                <td className={cx("num px-5 py-2.5 text-right", r.missing >= 2 && "font-bold text-terracotta-600")}>{r.missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
