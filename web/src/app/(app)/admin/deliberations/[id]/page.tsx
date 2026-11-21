import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Lock, Send, Unlock, Calculator } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatScore } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { loadDeliberation, loadUEs, one } from "@/lib/deliberation";
import type { Decision, UEResult } from "@/lib/lmd";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, Select, buttonClass } from "@/components/ui";
import { addBonus, computeResults, deleteDeliberation, issueTranscripts, removeBonus, setStatus } from "../actions";

type ResultRow = {
  student_id: string;
  student_name: string;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
};

const decisionTone: Record<Decision, "brand" | "info" | "danger" | "neutral"> = {
  admitted: "brand",
  admitted_compensation: "info",
  resit: "danger",
  incomplete: "neutral",
};

const ueClass: Record<UEResult["status"], string> = {
  validated: "text-slate-900",
  compensated: "text-amber-700",
  failed: "text-red-600 font-semibold",
  incomplete: "text-slate-400",
};

export default async function DeliberationPage({ params, searchParams }: PageProps<"/admin/deliberations/[id]">) {
  const { id } = await params;
  const q = await searchParams;
  const [{ supabase, isAdmin }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const d = await loadDeliberation(supabase, id);
  if (!d) notFound();

  const [ues, results, { data: adjData }, { data: trData }] = await Promise.all([
    loadUEs(supabase, d),
    fetchAll<ResultRow>((from, to) =>
      supabase
        .from("deliberation_results")
        .select("student_id, student_name, ue_results, semester_average, credits_earned, credits_total, decision")
        .eq("deliberation_id", id)
        .order("student_name")
        .range(from, to),
    ),
    supabase
      .from("jury_adjustments")
      .select("id, student_id, teaching_unit_id, bonus, reason, created_at")
      .eq("deliberation_id", id)
      .order("created_at"),
    supabase.from("transcripts").select("id, student_id").eq("deliberation_id", id),
  ]);
  const adjustments = (adjData ?? []) as Array<{ id: number; student_id: string; teaching_unit_id: string; bonus: number; reason: string; created_at: string }>;
  const transcripts = new Map(((trData ?? []) as Array<{ id: string; student_id: string }>).map((x) => [x.student_id, x.id]));
  const programme = one(d.programme);
  const semester = one(d.semester);
  const draft = d.status === "draft";
  const nameOf = (sid: string) => results.find((r) => r.student_id === sid)?.student_name ?? sid.slice(0, 8);
  const ueCode = (uid: string) => ues.find((u) => u.id === uid)?.code ?? "—";

  const counts = (Object.keys(t.lmd.decisions) as Decision[]).map((k) => [k, results.filter((r) => r.decision === k).length] as const);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/deliberations" className="text-sm text-brand-700 hover:underline">
            ← {t.lmd.deliberations}
          </Link>
          <h2 className="text-xl font-semibold text-slate-900">
            {programme?.name} · {d.level}
          </h2>
          <p className="text-sm text-slate-500">
            {semester?.label} · {one(semester?.academic_year)?.label} ·{" "}
            {d.computed_at ? `${t.lmd.computedAt} ${formatDateTime(locale, d.computed_at)}` : t.lmd.notComputed}
          </p>
        </div>
        <Badge tone={d.status === "published" ? "brand" : d.status === "locked" ? "warn" : "neutral"}>{t.lmd.status[d.status]}</Badge>
      </div>

      <Flash error={errorText(t, typeof q.error === "string" ? q.error : null)} ok={q.ok ? t.common.saved : null} />
      {d.status === "locked" ? <p className="text-sm text-amber-800">{t.lmd.lockedNote}</p> : null}
      {d.status === "published" ? <p className="text-sm text-brand-700">{t.lmd.publishedNote}</p> : null}

      <div className="flex flex-wrap gap-2">
        {draft ? (
          <>
            <form action={computeResults}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit">
                <Calculator size={16} aria-hidden />
                {d.computed_at ? t.lmd.recompute : t.lmd.compute}
              </Button>
            </form>
            {d.computed_at && results.length ? (
              <form action={setStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value="locked" />
                <Button type="submit" variant="secondary">
                  <Lock size={16} aria-hidden />
                  {t.lmd.lock}
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
        {d.status === "locked" ? (
          <>
            <form action={setStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="published" />
              <Button type="submit">
                <Send size={16} aria-hidden />
                {t.lmd.publish}
              </Button>
            </form>
            {isAdmin ? (
              <form action={setStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value="draft" />
                <Button type="submit" variant="ghost">
                  <Unlock size={16} aria-hidden />
                  {t.lmd.unlock}
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
        {d.status !== "draft" ? (
          <a href={`/admin/deliberations/${id}/pv`} className={buttonClass("secondary")}>
            <FileDown size={16} aria-hidden />
            {t.lmd.pv}
          </a>
        ) : null}
        {d.status === "published" ? (
          <form action={issueTranscripts}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="secondary">
              {t.lmd.issueTranscripts} ({transcripts.size}/{results.length})
            </Button>
          </form>
        ) : null}
      </div>

      {ues.length === 0 ? <Empty>{t.lmd.noUesForDelib}</Empty> : null}
      {ues.length > 0 && d.computed_at && results.length === 0 ? <Empty>{t.lmd.noStudents}</Empty> : null}

      {results.length ? (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {counts.map(([k, n]) => (
              <Badge key={k} tone={decisionTone[k]}>
                {t.lmd.decisions[k]} : {n}
              </Badge>
            ))}
          </div>
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-3 py-2.5 text-xs text-slate-500">#</th>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">{t.lmd.student}</th>
                  {ues.map((u) => (
                    <th key={u.id} className="px-3 py-2.5 text-center font-medium text-slate-600" title={u.title}>
                      {u.code}
                      <span className="block text-xs font-normal text-slate-400">
                        {u.credits} {t.lmd.credits.toLowerCase()}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">{t.lmd.average}</th>
                  <th className="px-3 py-2.5 text-center">{t.lmd.credits}</th>
                  <th className="px-3 py-2.5">{t.lmd.decision}</th>
                  {d.status === "published" ? <th className="px-3 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.student_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium">{r.student_name}</td>
                    {ues.map((u) => {
                      const ue = r.ue_results.find((x) => x.ue_id === u.id);
                      const tip = ue?.courses.map((c) => `${c.code}: ${formatScore(locale, c.mark)} (×${c.coefficient})`).join("\n");
                      return (
                        <td key={u.id} className={`px-3 py-2 text-center tabular-nums ${ue ? ueClass[ue.status] : "text-slate-400"}`} title={tip}>
                          {ue?.final === null || !ue ? "ABS" : formatScore(locale, ue.final)}
                          {ue?.bonus ? <sup className="ml-0.5 text-[10px] text-brand-700">+{formatScore(locale, ue.bonus)}</sup> : null}
                          {ue?.status === "compensated" ? <span className="ml-1 text-[10px]">C</span> : null}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.semester_average !== null && Number(r.semester_average) < 10 ? "text-red-600" : ""}`}>
                      {formatScore(locale, r.semester_average === null ? null : Number(r.semester_average))}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.credits_earned}/{r.credits_total}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={decisionTone[r.decision]}>{t.lmd.decisions[r.decision]}</Badge>
                    </td>
                    {d.status === "published" ? (
                      <td className="px-3 py-2 text-right">
                        {transcripts.get(r.student_id) ? (
                          <a href={`/results/transcripts/${transcripts.get(r.student_id)}`} className="text-xs font-medium text-brand-700 hover:underline">
                            PDF
                          </a>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      <Card id="jury" className="scroll-mt-6">
        <CardHeader title={`${t.lmd.jury} (${adjustments.length})`} />
        {adjustments.length ? (
          <ul className="divide-y divide-slate-100">
            {adjustments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="font-medium">{nameOf(a.student_id)}</span>
                <Badge>{ueCode(a.teaching_unit_id)}</Badge>
                <span className="font-semibold text-brand-700">+{formatScore(locale, Number(a.bonus))}</span>
                <span className="flex-1 text-slate-600">{a.reason}</span>
                {draft ? (
                  <form action={removeBonus}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="adjustment_id" value={a.id} />
                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                      {t.modules.remove}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {draft && results.length && ues.length ? (
          <form action={addBonus} className="grid items-end gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-[1.4fr_1fr_90px_1.6fr_auto]">
            <input type="hidden" name="id" value={id} />
            <Field label={t.lmd.student}>
              <Select name="student_id" required>
                {results.map((r) => (
                  <option key={r.student_id} value={r.student_id}>
                    {r.student_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.lmd.ue}>
              <Select name="teaching_unit_id" required>
                {ues.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.lmd.bonus}>
              <Input name="bonus" inputMode="decimal" required placeholder="0,5" />
            </Field>
            <Field label={t.lmd.reason}>
              <Input name="reason" required minLength={3} />
            </Field>
            <Button type="submit" variant="secondary">
              {t.common.add}
            </Button>
          </form>
        ) : null}
      </Card>

      {draft ? (
        <form action={deleteDeliberation} className="text-right">
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
            {t.common.delete}
          </button>
        </form>
      ) : null}
    </div>
  );
}
