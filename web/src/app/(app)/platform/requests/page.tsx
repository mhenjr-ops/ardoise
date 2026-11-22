import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { markRequestHandled } from "../actions";
import { markSupportDone } from "../[slug]/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.master.requests };
}

type SchoolRequest = {
  id: string;
  body: string;
  created_at: string;
  handled_at: string | null;
  institution: { name: string; slug: string } | { name: string; slug: string }[] | null;
  author: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  handler: { full_name: string } | { full_name: string }[] | null;
};
type Demo = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  institution: string;
  job_title: string | null;
  city: string | null;
  message: string;
  created_at: string;
  handled_at: string | null;
};

const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);

/** One place for everything waiting on the Ardoise team: what universities ask, and demo requests. */
export default async function PlatformRequestsPage() {
  const [{ supabase, isPlatformAdmin }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();

  const select =
    "id, body, created_at, handled_at, institution:institutions(name, slug), author:profiles!support_requests_created_by_fkey(full_name, email), handler:profiles!support_requests_handled_by_fkey(full_name)";
  const [{ data: waiting }, { data: done }, { data: demos }] = await Promise.all([
    supabase.from("support_requests").select(select).is("handled_at", null).order("created_at", { ascending: true }).limit(200),
    supabase.from("support_requests").select(select).not("handled_at", "is", null).order("handled_at", { ascending: false }).limit(30),
    supabase
      .from("demo_requests")
      .select("*")
      .order("handled_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const open = (waiting ?? []) as SchoolRequest[];
  const closed = (done ?? []) as SchoolRequest[];
  const demoList = (demos ?? []) as Demo[];
  const openDemos = demoList.filter((d) => !d.handled_at).length;

  const schoolItem = (r: SchoolRequest) => {
    const school = one(r.institution);
    const author = one(r.author);
    const handler = one(r.handler);
    return (
      <li key={r.id} className="space-y-1.5 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={`/platform/${school?.slug ?? ""}`} className="font-semibold text-brand-600 hover:underline">
            {school?.name}
          </Link>
          <span className="text-[13px] text-slate-500">{formatDate(locale, r.created_at)}</span>
        </div>
        <p className="whitespace-pre-line text-[15px] text-slate-800">{r.body}</p>
        <p className="text-[13px] text-slate-500">
          {author ? (
            <a href={`mailto:${author.email}`} className="hover:underline">
              {author.full_name || author.email}
            </a>
          ) : null}
          {r.handled_at ? ` — ${t.structure.statusDone.toLowerCase()} ${formatDate(locale, r.handled_at)}${handler?.full_name ? `, ${handler.full_name}` : ""}` : ""}
        </p>
        {r.handled_at ? null : (
          <form action={markSupportDone} className="pt-1">
            <input type="hidden" name="back" value="/platform/requests" />
            <input type="hidden" name="slug" value={school?.slug ?? ""} />
            <input type="hidden" name="id" value={r.id} />
            <Button type="submit" size="sm" variant="secondary">
              {t.structure.markDone}
            </Button>
          </form>
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader title={t.master.requests} subtitle={t.master.requestsIntro} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div id="requests" className="scroll-mt-6 space-y-6">
          <Card>
            <CardHeader title={`${t.master.fromSchools} · ${t.master.waiting} (${open.length})`} />
            {open.length ? (
              <ul className="divide-y divide-slate-100">{open.map(schoolItem)}</ul>
            ) : (
              <p className="px-5 py-6 text-[14.5px] text-slate-500">{t.master.noSchoolRequests}</p>
            )}
          </Card>
          {closed.length ? (
            <details className="group rounded-[var(--radius-card)] border border-slate-200 bg-paper">
              <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                {t.master.done} ({closed.length})
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100">{closed.map(schoolItem)}</ul>
            </details>
          ) : null}
        </div>

        <Card id="demos" className="scroll-mt-6">
          <CardHeader title={`${t.master.demos} (${openDemos})`} />
          {demoList.length === 0 ? (
            <p className="px-5 py-6 text-[14.5px] text-slate-500">{t.platform.noRequests}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {demoList.map((r) => (
                <li key={r.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{r.institution}</p>
                      <p className="text-[14px] text-slate-600">{[r.full_name, r.job_title, r.city].filter(Boolean).join(", ")}</p>
                    </div>
                    <span className="text-[13px] text-slate-500">{formatDate(locale, r.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                    <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                      <Mail size={14} aria-hidden />
                      {r.email}
                    </a>
                    {r.phone ? (
                      <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                        <Phone size={14} aria-hidden />
                        {r.phone}
                      </a>
                    ) : null}
                  </div>
                  {r.message ? <p className="whitespace-pre-line text-[14.5px] text-slate-700">{r.message}</p> : null}
                  {r.handled_at ? (
                    <Badge tone="success">{t.platform.handled}</Badge>
                  ) : (
                    <form action={markRequestHandled}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        {t.platform.markHandled}
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
