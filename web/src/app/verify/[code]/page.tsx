import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { formatDate, formatScore } from "@/lib/format";
import type { TranscriptPayload } from "@/lib/pdf";
import { LocaleSwitch } from "@/components/locale-switch";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.lmd.verifyTitle, robots: { index: false } };
}

type Verified = { code: string; issued_at: string; institution: string; payload: TranscriptPayload } | null;

/** Public page opened from a transcript's QR code: shows exactly what the transcript states. */
export default async function VerifyPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  const { t, locale } = await getI18n();
  const supabase = await createClient();
  const { data } = await supabase.rpc("verify_transcript", { p_code: code.slice(0, 32) });
  const v = data as Verified;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 font-bold text-white">A</span>
          <span className="font-semibold">Ardoise</span>
        </div>
        <LocaleSwitch locale={locale} />
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t.lmd.verifyTitle}</h1>

      {!v ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          <XCircle className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t.lmd.verifyInvalid}</p>
            <p className="mt-1 font-mono text-sm">{code}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-brand-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 bg-brand-50 px-5 py-4 text-brand-800">
            <CheckCircle2 aria-hidden />
            <div>
              <p className="font-semibold">{t.lmd.verifyValid}</p>
              <p className="text-sm">
                {v.institution} · {t.lmd.issuedOn} {formatDate(locale, v.issued_at)}
              </p>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-3 px-5 py-5 text-sm sm:grid-cols-2">
            {(
              [
                [t.lmd.student, v.payload.student_name],
                [t.lmd.programme, v.payload.programme],
                [t.lmd.level, v.payload.level],
                [t.lmd.semester, `${v.payload.semester} · ${v.payload.academic_year}`],
                [t.lmd.average, `${formatScore(locale, v.payload.semester_average)} /20`],
                [t.lmd.credits, `${v.payload.credits_earned} / ${v.payload.credits_total}`],
                [t.lmd.decision, t.lmd.decisions[v.payload.decision]],
                ["Code", v.code],
              ] as Array<[string, string]>
            ).map(([k, val]) => (
              <div key={k}>
                <dt className="text-[12.5px] font-semibold text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{val}</dd>
              </div>
            ))}
          </dl>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
            {v.payload.ue_results.map((u) => (
              <li key={u.ue_id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-20 text-xs font-semibold text-slate-500">{u.code}</span>
                <span className="flex-1">{u.title}</span>
                <span className="tabular-nums">{formatScore(locale, u.final)}</span>
                <span className="w-28 text-right text-xs text-slate-500">{t.lmd.ueStatus[u.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
