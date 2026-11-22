import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Clock, MessagesSquare, Pencil, UserMinus } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { Avatar, Badge, Button, Card, Field, Flash, Input, PageHeader, Select, cx } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { createTeamInvite, removeTeammate, revokeTeamInvite, updateTeamInvite, updateTeammate } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.master.teamTitle };
}

type Mate = {
  user_id: string;
  full_name: string;
  email: string;
  role: "owner" | "member";
  title: string;
  reports_to: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
};
type Invite = {
  id: string;
  token: string;
  full_name: string;
  email: string | null;
  title: string;
  reports_to: string | null;
  expires_at: string;
  created_by: string | null;
};
type Node =
  | { kind: "mate"; id: string; mate: Mate; children: Node[] }
  | { kind: "invite"; id: string; invite: Invite; children: Node[] };

/** The Ardoise team as a chart: who does what, who reports to whom, and who is invited but not in yet. */
export default async function PlatformTeamPage({ searchParams }: PageProps<"/platform/team">) {
  const [{ supabase, isPlatformAdmin, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const sp = await searchParams;

  const [{ data: team }, { data: links }, origin] = await Promise.all([
    supabase.rpc("platform_team"),
    supabase
      .from("platform_invitations")
      .select("id, token, full_name, email, title, reports_to, expires_at, created_by")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at"),
    siteOrigin(),
  ]);
  const mates = (team ?? []) as Mate[];
  const invites = (links ?? []) as Invite[];
  const isOwner = mates.some((m) => m.user_id === user.id && m.role === "owner");
  const owner = mates.find((m) => m.role === "owner") ?? mates[0];
  const fresh = sp.created ? [...invites].reverse().find((l) => l.created_by === user.id) : undefined;

  // The chart: everyone under their manager (or the owner), people still invited under theirs.
  const known = new Set(mates.map((m) => m.user_id));
  const parentOf = (reportsTo: string | null) => (reportsTo && known.has(reportsTo) ? reportsTo : owner?.user_id);
  const nodes = new Map<string, Node>(mates.map((m) => [m.user_id, { kind: "mate", id: m.user_id, mate: m, children: [] }]));
  for (const m of mates) {
    if (m.user_id === owner?.user_id) continue;
    nodes.get(parentOf(m.reports_to) ?? "")?.children.push(nodes.get(m.user_id)!);
  }
  for (const l of invites) {
    nodes.get(parentOf(l.reports_to) ?? "")?.children.push({ kind: "invite", id: l.id, invite: l, children: [] });
  }
  const root = owner ? nodes.get(owner.user_id) : undefined;

  // Who someone can report to: anyone on the team except themselves and the people under them.
  const below = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (n: Node) => n.children.forEach((c) => c.kind === "mate" && (out.add(c.id), walk(c)));
    const n = nodes.get(id);
    if (n) walk(n);
    return out;
  };
  const managerOptions = (exclude: Set<string>) =>
    mates
      .filter((m) => !exclude.has(m.user_id))
      .map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email}
          {m.title ? `, ${m.title}` : ""}
        </option>
      ));

  const share = (l: Invite) => (
    <ShareLink
      url={`${origin}/join/${l.token}`}
      message={t.master.teamShare}
      labels={{ copy: t.share.copy, copied: t.share.copied, whatsapp: t.share.whatsapp }}
    />
  );

  const editForm = (action: (fd: FormData) => Promise<void>, hidden: ReactNode, title: string, reportsTo: string | null, exclude: Set<string> | null) => (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {hidden}
      <Field label={t.master.jobTitle}>
        <Input name="title" defaultValue={title} maxLength={80} placeholder={t.master.jobTitleHint} />
      </Field>
      {exclude ? (
        <Field label={t.master.reportsTo}>
          <Select name="reports_to" defaultValue={reportsTo ?? owner?.user_id ?? ""}>
            {managerOptions(exclude)}
          </Select>
        </Field>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="sm">
          {t.common.save}
        </Button>
      </div>
    </form>
  );

  const card = (n: Node): ReactNode => {
    if (n.kind === "invite") {
      const l = n.invite;
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-paper/70 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400">
              <Clock size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-800">{l.full_name || l.email}</p>
              <p className="truncate text-[13px] text-slate-500">
                {[l.title, t.master.invited].filter(Boolean).join(" · ")}
                {" — "}
                {fmt(t.staffing.expires, { date: formatDate(locale, l.expires_at) })}
              </p>
            </div>
          </div>
          {isOwner ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 pl-[3.25rem] text-[14px]">
              <details className="group w-full">
                <summary className="inline-flex cursor-pointer list-none items-center font-semibold text-brand-600 hover:underline [&::-webkit-details-marker]:hidden">
                  {t.master.showLink}
                </summary>
                <div className="mt-2">{share(l)}</div>
              </details>
              <details className="group w-full">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-slate-600 hover:underline [&::-webkit-details-marker]:hidden">
                  <Pencil size={13} aria-hidden />
                  {t.master.edit}
                </summary>
                <div className="mt-3">
                  {editForm(updateTeamInvite, <input type="hidden" name="id" value={l.id} />, l.title, l.reports_to, new Set())}
                </div>
              </details>
              <form action={revokeTeamInvite}>
                <input type="hidden" name="id" value={l.id} />
                <button type="submit" className="font-semibold text-terracotta-600 hover:underline">
                  {t.master.cancel}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      );
    }
    const m = n.mate;
    const me = m.user_id === user.id;
    return (
      <div className={cx("rounded-2xl border bg-paper p-4", m.role === "owner" ? "border-ardoise/40 shadow-sm" : "border-slate-200")}>
        <div className="flex items-center gap-3">
          <Avatar name={m.full_name || m.email} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-semibold text-slate-900">
              <span className="truncate">{m.full_name || m.email}</span>
              {me ? <span className="text-[13px] font-normal text-slate-500">({t.master.you})</span> : null}
              {m.role === "owner" ? <Badge tone="brand">{t.master.owner}</Badge> : null}
            </p>
            <p className="truncate text-[13.5px] text-slate-600">{m.title || (m.role === "owner" ? t.master.owner : t.master.member)}</p>
            <p className="truncate text-[12.5px] text-slate-400">
              {m.last_sign_in_at ? fmt(t.master.lastSeen, { date: formatDate(locale, m.last_sign_in_at) }) : t.master.never}
            </p>
          </div>
          {!me ? (
            <Link
              href={`/platform/messages?with=${m.user_id}`}
              title={t.master.message}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[13.5px] font-semibold text-slate-700 hover:border-ardoise"
            >
              <MessagesSquare size={15} aria-hidden />
              <span className="hidden sm:inline">{t.master.message}</span>
            </Link>
          ) : null}
        </div>
        {isOwner ? (
          <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 pl-[3.25rem] text-[14px]">
            <details className="group w-full">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-slate-600 hover:underline [&::-webkit-details-marker]:hidden">
                <Pencil size={13} aria-hidden />
                {t.master.edit}
              </summary>
              <div className="mt-3">
                {editForm(
                  updateTeammate,
                  <input type="hidden" name="user_id" value={m.user_id} />,
                  m.title,
                  m.reports_to,
                  m.role === "owner" ? null : new Set([m.user_id, ...below(m.user_id)]),
                )}
              </div>
            </details>
            {m.role === "member" ? (
              <form action={removeTeammate}>
                <input type="hidden" name="user_id" value={m.user_id} />
                <button type="submit" className="inline-flex items-center gap-1 font-semibold text-terracotta-600 hover:underline">
                  <UserMinus size={14} aria-hidden />
                  {t.master.remove}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  // Each level is indented, with a line from the manager down to each person under them.
  const subtree = (n: Node): ReactNode => (
    <>
      {card(n)}
      {n.children.length ? (
        <ul className="ml-5 mt-3 space-y-3 border-l-2 border-slate-200 pl-5 sm:ml-8 sm:pl-7">
          {n.children.map((c) => (
            <li
              key={c.id}
              className="relative before:absolute before:-left-5 before:top-8 before:h-0.5 before:w-5 before:bg-slate-200 sm:before:-left-7 sm:before:w-7"
            >
              {subtree(c)}
            </li>
          ))}
        </ul>
      ) : null}
    </>
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="chart">
          <h2 id="chart" className="mb-4 font-display text-xl font-semibold">
            {t.master.chart} <span className="text-[15px] font-normal text-slate-500">({mates.length + invites.length})</span>
          </h2>
          {root ? subtree(root) : null}
        </section>

        <Card className="p-5 xl:sticky xl:top-6">
          <h2 className="font-display text-xl font-semibold">{t.master.inviteTitle}</h2>
          {isOwner ? (
            <>
              <p className="mb-4 mt-1 text-[14px] leading-relaxed text-slate-600">{t.master.inviteBody}</p>
              <form action={createTeamInvite} className="space-y-4">
                <Field label={t.master.inviteName}>
                  <Input name="full_name" required minLength={2} maxLength={200} />
                </Field>
                <Field label={t.master.jobTitle}>
                  <Input name="title" maxLength={80} placeholder={t.master.jobTitleHint} />
                </Field>
                <Field label={t.master.reportsTo}>
                  <Select name="reports_to" defaultValue={user.id}>
                    {managerOptions(new Set())}
                  </Select>
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
      </div>
    </>
  );
}
