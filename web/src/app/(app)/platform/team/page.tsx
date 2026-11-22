import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserMinus } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { Avatar, Badge, Button, Card, CardHeader, Field, Flash, Input, PageHeader } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { createTeamInvite, removeTeammate, revokeTeamInvite } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.master.teamTitle };
}

type Mate = { user_id: string; full_name: string; email: string; role: "owner" | "member"; joined_at: string; last_sign_in_at: string | null };
type Link = { id: string; token: string; full_name: string; email: string | null; expires_at: string; created_by: string | null };

/** The Ardoise team: the owner and the assistants, each with their own login. */
export default async function PlatformTeamPage({ searchParams }: PageProps<"/platform/team">) {
  const [{ supabase, isPlatformAdmin, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const sp = await searchParams;

  const [{ data: team }, { data: links }, origin] = await Promise.all([
    supabase.rpc("platform_team"),
    supabase
      .from("platform_invitations")
      .select("id, token, full_name, email, expires_at, created_by")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    siteOrigin(),
  ]);
  const mates = (team ?? []) as Mate[];
  const isOwner = mates.some((m) => m.user_id === user.id && m.role === "owner");
  const pending = (links ?? []) as Link[];
  const fresh = sp.created ? pending.find((l) => l.created_by === user.id) : undefined;
  const share = (l: Link) => (
    <ShareLink
      url={`${origin}/join/${l.token}`}
      message={t.master.teamShare}
      labels={{ copy: t.share.copy, copied: t.share.copied, whatsapp: t.share.whatsapp }}
    />
  );

  return (
    <>
      <PageHeader title={t.master.teamTitle} subtitle={t.master.teamIntro} />
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} ok={sp.ok ? t.common.saved : null} />

      {fresh ? (
        <Card className="mb-6 border-ochre-200 bg-ochre-50/60 p-5">
          <p className="mb-3 font-display text-lg font-semibold">{fmt(t.master.linkFor, { name: fresh.full_name })}</p>
          {share(fresh)}
        </Card>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={`${t.master.team} (${mates.length})`} />
          <ul className="divide-y divide-slate-100">
            {mates.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={m.full_name || m.email} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-slate-900">
                    {m.full_name || m.email}
                    {m.user_id === user.id ? <span className="text-[13px] font-normal text-slate-500">({t.master.you})</span> : null}
                    <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.role === "owner" ? t.master.owner : t.master.member}</Badge>
                  </p>
                  <p className="truncate text-[13px] text-slate-500">
                    {m.email} — {fmt(t.master.joined, { date: formatDate(locale, m.joined_at) })},{" "}
                    {m.last_sign_in_at ? fmt(t.master.lastSeen, { date: formatDate(locale, m.last_sign_in_at) }) : t.master.never}
                  </p>
                </div>
                {isOwner && m.role === "member" ? (
                  <form action={removeTeammate}>
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <button
                      type="submit"
                      title={t.master.remove}
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-terracotta-50 hover:text-terracotta-600"
                    >
                      <UserMinus size={17} aria-hidden />
                      <span className="sr-only">{t.master.remove}</span>
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display text-xl font-semibold">{t.master.inviteTitle}</h2>
            {isOwner ? (
              <>
                <p className="mb-4 mt-1 text-[14px] leading-relaxed text-slate-600">{t.master.inviteBody}</p>
                <form action={createTeamInvite} className="space-y-4">
                  <Field label={t.master.inviteName}>
                    <Input name="full_name" required minLength={2} maxLength={200} />
                  </Field>
                  <Field label={t.master.inviteEmail} hint={t.master.inviteEmailHelp}>
                    <Input name="email" type="email" maxLength={320} />
                  </Field>
                  <Button type="submit">{t.master.createLink}</Button>
                </form>
              </>
            ) : (
              <p className="mt-1 text-[14px] text-slate-600">{t.master.ownerOnly}</p>
            )}
          </Card>

          {pending.length ? (
            <Card>
              <CardHeader title={`${t.master.pendingLinks} (${pending.length})`} />
              <ul className="divide-y divide-slate-100">
                {pending.map((l) => (
                  <li key={l.id} className="space-y-2 px-5 py-4">
                    <p className="flex flex-wrap items-baseline justify-between gap-2 text-[14.5px]">
                      <span className="font-semibold text-slate-900">{[l.full_name, l.email].filter(Boolean).join(", ")}</span>
                      <span className="text-[13px] text-slate-500">{fmt(t.staffing.expires, { date: formatDate(locale, l.expires_at) })}</span>
                    </p>
                    {isOwner ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">{share(l)}</div>
                        <form action={revokeTeamInvite}>
                          <input type="hidden" name="id" value={l.id} />
                          <button type="submit" className="h-10 px-2 text-[14px] font-semibold text-terracotta-600 hover:underline">
                            {t.master.cancel}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
