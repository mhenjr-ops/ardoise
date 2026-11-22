import Link from "next/link";
import { ArrowRight, ClipboardList, Gavel } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";
import { fmt } from "@/lib/i18n/messages-engage";
import type { Messages } from "@/lib/i18n/messages";
import { Badge, Card, CardHeader } from "@/components/ui";

type Client = Awaited<ReturnType<typeof createClient>>;
type Delib = {
  id: string;
  level: string;
  status: "draft" | "locked" | "published";
  programme: { name: string } | { name: string }[] | null;
  semester: { label: string } | { label: string }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The registrar's desk: who still has to sign up, accounts to check, deliberations. */
export async function OfficePanel({ supabase, institutionId, t }: { supabase: Client; institutionId: string; t: Messages }) {
  const head = { count: "exact" as const, head: true };
  const [total, linked, claims, { data: delibs }] = await Promise.all([
    supabase.from("student_roster").select("id", head).eq("institution_id", institutionId),
    supabase.from("student_roster").select("id", head).eq("institution_id", institutionId).not("claimed_by", "is", null),
    supabase.from("matricule_claims").select("id", head).eq("institution_id", institutionId).in("status", ["waiting", "disputed"]),
    supabase
      .from("deliberations")
      .select("id, level, status, programme:programmes(name), semester:semesters(label)")
      .eq("institution_id", institutionId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  const pct = total.count ? Math.round(((linked.count ?? 0) / total.count) * 100) : 0;

  return (
    <section className="mb-8 grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ardoise text-chalk">
            <ClipboardList size={19} aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold">{t.roster.title}</h2>
            <p className="text-[14.5px] text-slate-600">{fmt(t.home.rosterProgress, { n: linked.count ?? 0, total: total.count ?? 0 })}</p>
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-ardoise" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {claims.count ? <Badge tone="warn">{fmt(t.home.claimsWaiting, { n: claims.count })}</Badge> : <span />}
          <Link href="/admin/students" className="inline-flex items-center gap-1 text-[14px] font-semibold text-brand-600 hover:underline">
            {t.home.viewAll}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader
          title={t.home.deliberations}
          icon={<Gavel size={17} aria-hidden />}
          action={
            <Link href="/admin/deliberations" className="text-[13.5px] font-semibold text-brand-600 hover:underline">
              {t.home.viewAll}
            </Link>
          }
        />
        {(delibs ?? []).length === 0 ? (
          <p className="px-5 py-5 text-[14.5px] text-slate-500">{t.home.noDeliberations}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {((delibs ?? []) as Delib[]).map((d) => (
              <li key={d.id}>
                <Link href={`/admin/deliberations/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {one(d.programme)?.name} · {d.level}
                    </span>
                    <span className="text-[13px] text-slate-500">{one(d.semester)?.label}</span>
                  </span>
                  <Badge tone={d.status === "published" ? "success" : d.status === "locked" ? "warn" : "neutral"}>{t.lmd.status[d.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
