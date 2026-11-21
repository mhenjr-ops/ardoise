import type { Metadata } from "next";
import { FileDown } from "lucide-react";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate, formatScore } from "@/lib/format";
import { one } from "@/lib/deliberation";
import type { Decision, UEResult } from "@/lib/lmd";
import { Badge, Card, Empty, PageHeader, buttonClass } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.lmd.myResults };
}

type Row = {
  deliberation_id: string;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
  deliberation: {
    level: string;
    published_at: string | null;
    programme: { name: string } | { name: string }[] | null;
    semester: { label: string; academic_year: { label: string } | { label: string }[] | null } | null;
  } | null;
};

const tone: Record<Decision, "brand" | "info" | "danger" | "neutral"> = {
  admitted: "brand",
  admitted_compensation: "info",
  resit: "danger",
  incomplete: "neutral",
};

export default async function ResultsPage() {
  const [{ supabase, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  const [{ data }, { data: tr }] = await Promise.all([
    supabase
      .from("deliberation_results")
      .select(
        "deliberation_id, ue_results, semester_average, credits_earned, credits_total, decision, deliberation:deliberations(level, published_at, programme:programmes(name), semester:semesters(label, academic_year:academic_years(label)))",
      )
      .eq("student_id", user.id),
    supabase.from("transcripts").select("id, deliberation_id").eq("student_id", user.id),
  ]);
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) =>
    String(one(b.deliberation)?.published_at ?? "").localeCompare(String(one(a.deliberation)?.published_at ?? "")),
  );
  const transcripts = new Map(((tr ?? []) as Array<{ id: string; deliberation_id: string }>).map((x) => [x.deliberation_id, x.id]));

  return (
    <>
      <PageHeader title={t.lmd.myResults} />
      {rows.length === 0 ? (
        <Empty>{t.lmd.noResults}</Empty>
      ) : (
        <div className="space-y-6">
          {rows.map((r) => {
            const d = one(r.deliberation);
            const sem = one(d?.semester);
            const transcriptId = transcripts.get(r.deliberation_id);
            return (
              <Card key={r.deliberation_id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {one(d?.programme)?.name} · {d?.level}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {sem?.label} · {one(sem?.academic_year)?.label}
                      {d?.published_at ? ` · ${formatDate(locale, d.published_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={tone[r.decision]}>{t.lmd.decisions[r.decision]}</Badge>
                    {transcriptId ? (
                      <a href={`/results/transcripts/${transcriptId}`} className={buttonClass("secondary", "sm")}>
                        <FileDown size={14} aria-hidden />
                        {t.lmd.transcript}
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[12.5px] font-semibold text-slate-500">{t.lmd.average}</p>
                    <p className="text-2xl font-semibold">
                      {formatScore(locale, r.semester_average === null ? null : Number(r.semester_average))}
                      <span className="text-sm font-normal text-slate-500">/20</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-slate-500">{t.lmd.credits}</p>
                    <p className="text-2xl font-semibold">
                      {r.credits_earned}
                      <span className="text-sm font-normal text-slate-500"> / {r.credits_total}</span>
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {r.ue_results.map((u) => (
                    <li key={u.ue_id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{u.code}</span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{u.title}</span>
                        <span className="text-xs text-slate-500">
                          {u.credits} {t.lmd.credits.toLowerCase()}
                        </span>
                        <span className="w-16 text-right text-sm font-semibold tabular-nums">{formatScore(locale, u.final)}</span>
                        <Badge tone={u.status === "validated" ? "brand" : u.status === "compensated" ? "warn" : u.status === "failed" ? "danger" : "neutral"}>
                          {t.lmd.ueStatus[u.status]}
                        </Badge>
                      </div>
                      {u.courses.length > 1 ? (
                        <p className="mt-1 pl-[92px] text-xs text-slate-500">
                          {u.courses.map((c) => `${c.title} ${formatScore(locale, c.mark)} (×${formatScore(locale, c.coefficient)})`).join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
