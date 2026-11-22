import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Search, UserCheck } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { Avatar, Badge, Button, Card, CardHeader, Empty, Flash, Input } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { siteOrigin } from "@/lib/site";
import { resolveClaim } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.roster.title };
}

type RosterEntry = {
  id: string;
  matricule: string;
  full_name: string;
  programme: string | null;
  level: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
};
type ClaimRow = {
  id: string;
  matricule: string;
  full_name: string;
  status: "waiting" | "disputed";
  created_at: string;
  user_id: string;
  profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

const PAGE = 300;

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  const [{ supabase, institution, can }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.manageStudents) redirect("/admin/people");
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 80);

  let list = supabase
    .from("student_roster")
    .select("id, matricule, full_name, programme, level, claimed_by, claimed_at")
    .eq("institution_id", institution.id)
    .order("matricule")
    .limit(PAGE);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    list = list.or(`matricule.ilike.%${safe}%,full_name.ilike.%${safe}%`);
  }
  const [{ data: roster }, { count: total }, { count: linked }, { data: claims }] = await Promise.all([
    list,
    supabase.from("student_roster").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("student_roster").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).not("claimed_by", "is", null),
    supabase
      .from("matricule_claims")
      .select("id, matricule, full_name, status, created_at, user_id, profile:profiles(full_name, email)")
      .eq("institution_id", institution.id)
      .in("status", ["waiting", "disputed"])
      .order("created_at"),
  ]);

  const rows = (roster ?? []) as RosterEntry[];
  const claimRows = (claims ?? []) as ClaimRow[];

  // Who currently holds a disputed matricule.
  const disputedMatricules = claimRows.filter((c) => c.status === "disputed").map((c) => c.matricule);
  const { data: holders } = disputedMatricules.length
    ? await supabase
        .from("student_roster")
        .select("matricule, claimed_by, profile:profiles!student_roster_claimed_by_fkey(full_name, email)")
        .eq("institution_id", institution.id)
        .in("matricule", disputedMatricules)
    : { data: [] };
  const holderName = new Map(
    ((holders ?? []) as Array<{ matricule: string; profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null }>).map((h) => {
      const p = Array.isArray(h.profile) ? h.profile[0] : h.profile;
      return [h.matricule.toUpperCase(), p?.full_name || p?.email || ""];
    }),
  );

  return (
    <div className="space-y-6">
      <Flash error={errorText(t, typeof params.error === "string" ? params.error : null)} ok={params.ok ? t.common.saved : null} />
      <Card className="p-5">
        <p className="mb-3 text-[15px] text-slate-700">{t.roster.code}</p>
        <ShareLink
          url={`${await siteOrigin()}/join/${institution.slug}`}
          labels={{ copy: t.share.copy, copied: t.share.copied }}
        />
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader title={`${t.roster.claimsTitle} (${claimRows.length})`} />
          <p className="px-5 pt-3 text-[13.5px] text-slate-500">{t.roster.claimsBody}</p>
          {claimRows.length === 0 ? (
            <p className="px-5 py-5 text-[14.5px] text-slate-500">{t.roster.noClaims}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {claimRows.map((c) => {
                const p = Array.isArray(c.profile) ? c.profile[0] : c.profile;
                return (
                  <li key={c.id} className="space-y-2 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={p?.full_name || c.full_name || p?.email || "?"} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{p?.full_name || c.full_name}</p>
                        <p className="truncate text-[13.5px] text-slate-500">{p?.email}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px]">
                          <span className="num font-bold">{c.matricule}</span>
                          <Badge tone={c.status === "disputed" ? "danger" : "warn"}>
                            {c.status === "disputed" ? t.roster.disputed : t.roster.waiting}
                          </Badge>
                          <span className="text-slate-500">{formatDate(locale, c.created_at)}</span>
                        </p>
                        {c.status === "disputed" && holderName.get(c.matricule) ? (
                          <p className="mt-1 text-[13.5px] text-slate-600">{fmt(t.roster.claimedBy, { name: holderName.get(c.matricule)! })}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2 pl-[46px]">
                      <form action={resolveClaim}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="approve" value="1" />
                        <Button type="submit" size="sm">
                          <UserCheck size={15} aria-hidden />
                          {t.roster.approve}
                        </Button>
                      </form>
                      <form action={resolveClaim}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="approve" value="0" />
                        <Button type="submit" size="sm" variant="ghost">
                          {t.roster.reject}
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={`${t.roster.listTitle} · ${fmt(t.roster.signedUp, { n: linked ?? 0, total: total ?? 0 })}`} />
        <form className="flex gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input name="q" defaultValue={q} placeholder={t.roster.search} className="pl-9" />
          </div>
          <Button type="submit" variant="secondary">
            {t.shell.search}
          </Button>
        </form>
        {rows.length === 0 ? (
          <div className="p-5">
            <Empty>{t.roster.empty}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14.5px]">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="num whitespace-nowrap px-5 py-2.5 font-semibold">{r.matricule}</td>
                    <td className="px-2 py-2.5">{r.full_name}</td>
                    <td className="hidden px-2 py-2.5 text-slate-500 md:table-cell">{[r.programme, r.level].filter(Boolean).join(" · ")}</td>
                    <td className="px-5 py-2.5 text-right">
                      {r.claimed_by ? <Badge tone="success">{t.roster.linked}</Badge> : <Badge>{t.roster.notYet}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === PAGE ? <p className="px-5 py-3 text-[13px] text-slate-500">{fmt(t.roster.showing, { n: PAGE })}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
