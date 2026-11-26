import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CheckCircle2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, errorText } from "@/lib/i18n/server";
import { isLocale, messages, type Locale } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { Button, Card, Field, Flash, Input, Textarea } from "@/components/ui";
import { PublicShell } from "@/components/public/public-shell";
import { SchoolMark } from "@/components/school-mark";
import { answerReview } from "./actions";

export const metadata: Metadata = { title: "Ardoise", robots: { index: false } };

type Programme = { id: string; name: string; cycle: string };
type Department = { id: string; name: string; programmes: Programme[] };
type Unit = { id: string; name: string; code: string | null; kind: "faculty" | "school"; departments: Department[] };
type Review = {
  status: "open" | "expired" | "revoked";
  institution: string;
  short_name: string;
  brand_color: string;
  logo_path: string;
  locale: string;
  confirmed_at: string | null;
  units: Unit[];
} | null;

const box =
  "mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-slate-300 accent-terracotta-600 focus:ring-2 focus:ring-ochre-200";

/**
 * The page a registrar opens from the link the Ardoise team sends: no account needed. They see
 * the structure Ardoise prepared, tick what's wrong, add what's missing, or confirm it.
 */
export default async function ReviewPage({ params, searchParams }: PageProps<"/review/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("structure_review_open", { p_token: token.slice(0, 100) });
  const review = data as Review;

  // The visitor's own language choice first, then the university's.
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(chosen) ? chosen : review && isLocale(review.locale) ? review.locale : "en";
  const t = messages[locale];
  const r = t.review;

  if (!review || review.status !== "open") {
    return (
      <PublicShell locale={locale}>
        <h1 className="font-display text-[2.2rem] font-semibold leading-tight">{r.title}</h1>
        <Card className="mt-6 p-6 text-[15px] text-slate-700">{review ? r.closed : r.invalid}</Card>
      </PublicShell>
    );
  }

  const look = { name: review.institution, short_name: review.short_name, brand_color: review.brand_color, logo_path: review.logo_path };
  const sent = sp.sent === "confirmed" || sp.sent === "changes" ? sp.sent : null;
  const error = typeof sp.error === "string" ? errorText(t, sp.error) : null;

  return (
    <PublicShell locale={locale} wide>
      <div className="flex items-center gap-4">
        <SchoolMark look={look} size={64} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-slate-500">{review.institution}</p>
          <h1 className="font-display text-[2.2rem] font-semibold leading-tight">{r.title}</h1>
        </div>
      </div>

      {sent ? (
        <Card className="mt-8 flex items-start gap-4 p-6">
          <span className={sent === "confirmed" ? "text-leaf-600" : "text-ochre-600"}>
            {sent === "confirmed" ? <CheckCircle2 size={26} aria-hidden /> : <Send size={24} aria-hidden />}
          </span>
          <div>
            <p className="text-[16px] text-slate-800">{sent === "confirmed" ? r.thanksConfirmed : r.thanksChanges}</p>
            <Link href={`/review/${token}`} className="mt-3 inline-block text-[14.5px] font-semibold text-brand-700 hover:underline">
              {r.again}
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <p className="mt-4 max-w-3xl text-[16px] leading-relaxed text-slate-700">{r.intro}</p>
          {review.confirmed_at ? (
            <p className="mt-4 max-w-3xl rounded-xl bg-leaf-50 px-4 py-3 text-[15px] text-leaf-700 ring-1 ring-leaf-100">
              {fmt(r.confirmedOn, { date: formatDate(locale, review.confirmed_at) })}
            </p>
          ) : null}
          <Flash error={error} />

          <form action={answerReview} className="mt-8 space-y-6">
            <input type="hidden" name="token" value={token} />
            <p className="text-[14px] font-semibold text-slate-600">{r.tickHelp}</p>

            {review.units.map((u) => (
              <Card key={u.id} className="overflow-hidden">
                <label className="flex cursor-pointer items-start gap-3 border-b border-slate-100 bg-chalk/40 px-5 py-4">
                  <input type="checkbox" name="flag" value={u.id} className={box} />
                  <span className="min-w-0">
                    <span className="block font-display text-[1.2rem] font-semibold leading-snug text-slate-900">
                      {u.name}
                      {u.code ? <span className="ml-2 text-[14px] font-normal text-slate-500">{u.code}</span> : null}
                    </span>
                    <span className="text-[13px] text-slate-500">
                      {u.kind === "school" ? t.structure.kindSchool : t.structure.kindFaculty}
                    </span>
                  </span>
                </label>
                <div className="space-y-4 px-5 py-4">
                  {u.departments.length ? (
                    <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                      {u.departments.map((d) => (
                        <li key={d.id}>
                          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-slate-800">
                            <input type="checkbox" name="flag" value={d.id} className={box} />
                            <span>{d.name}</span>
                          </label>
                          {d.programmes.length ? (
                            <ul className="mt-1.5 space-y-1 border-l-2 border-ochre-200 pl-4 ml-[9px]">
                              {d.programmes.map((p) => (
                                <li key={p.id}>
                                  <label className="flex cursor-pointer items-start gap-3 text-[14px] text-slate-600">
                                    <input type="checkbox" name="flag" value={p.id} className={box} />
                                    <span>{p.name}</span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[14px] text-slate-500">{r.noDepartments}</p>
                  )}
                  <Field label={fmt(r.missingIn, { unit: u.code || u.name })} hint={r.missingHelp}>
                    <Textarea name={`missing:${u.id}`} rows={2} maxLength={2000} />
                  </Field>
                </div>
              </Card>
            ))}

            <Card className="space-y-4 p-5">
              <Field label={r.notes}>
                <Textarea name="notes" rows={3} maxLength={5000} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={r.name}>
                  <Input name="name" required minLength={2} maxLength={200} autoComplete="name" />
                </Field>
                <Field label={r.role}>
                  <Input name="title" maxLength={200} placeholder={r.rolePlaceholder} autoComplete="organization-title" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button type="submit" name="intent" value="changes" variant="secondary">
                  {r.send}
                </Button>
                {review.confirmed_at ? null : (
                  <Button type="submit" name="intent" value="confirm">
                    {r.confirm}
                  </Button>
                )}
              </div>
            </Card>
          </form>
        </>
      )}
    </PublicShell>
  );
}
