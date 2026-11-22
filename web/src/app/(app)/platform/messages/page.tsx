import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Send, UsersRound } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import { Avatar, Button, Card, Flash, PageHeader, Textarea, cx } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
import { sendTeamMessage } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.master.messages };
}

type Mate = { user_id: string; full_name: string; email: string; role: "owner" | "member"; title: string };
type Line = { peer: string | null; last_body: string | null; last_sender: string | null; last_at: string | null; unread: number };
type Message = { id: string; sender_id: string | null; body: string; created_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The Ardoise team's messages: one conversation for everyone, and one per pair of teammates. */
export default async function TeamMessagesPage({ searchParams }: PageProps<"/platform/messages">) {
  const [{ supabase, isPlatformAdmin, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const sp = await searchParams;

  const { data: team } = await supabase.rpc("platform_team");
  const mates = ((team ?? []) as Mate[]).filter((m) => m.user_id !== user.id);
  const asked = typeof sp.with === "string" ? sp.with : null;
  const peer = asked && UUID.test(asked) && mates.some((m) => m.user_id === asked) ? asked : null;
  const chosen = asked !== null; // on a phone, the list shows until a conversation is picked
  const active = peer ? mates.find((m) => m.user_id === peer)! : null;

  await supabase.rpc("team_mark_read", { p_peer: peer });
  const key = peer ? [user.id, peer].sort().join(":") : "team";
  const [{ data: inbox }, { data: thread }] = await Promise.all([
    supabase.rpc("team_inbox"),
    supabase.from("team_threads").select("id").eq("key", key).maybeSingle(),
  ]);
  const { data: msgs } = thread
    ? await supabase.from("team_messages").select("id, sender_id, body, created_at").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(200)
    : { data: [] as Message[] };
  const messages = (msgs ?? []) as Message[]; // newest first: shown bottom-up, so the newest sits at the bottom

  const lines = new Map(((inbox ?? []) as Line[]).map((l) => [l.peer ?? "team", l]));
  const nameOf = new Map<string, string>([[user.id, t.inbox.you], ...mates.map((m) => [m.user_id, m.full_name || m.email] as [string, string])]);
  const people = [...mates].sort((a, b) => {
    const la = lines.get(a.user_id)?.last_at ?? "";
    const lb = lines.get(b.user_id)?.last_at ?? "";
    return lb.localeCompare(la) || (a.full_name || a.email).localeCompare(b.full_name || b.email);
  });

  const row = (href: string, isActive: boolean, avatar: ReactNode, name: string, sub: string, line: Line | undefined) => {
    const preview = line?.last_body
      ? `${line.last_sender === user.id ? `${t.inbox.you}: ` : ""}${line.last_body}`
      : sub;
    return (
      <li key={href}>
        <Link
          href={href as "/platform/messages"}
          aria-current={isActive ? "page" : undefined}
          className={cx("flex items-center gap-3 px-4 py-3 hover:bg-slate-50", isActive && "bg-brand-50/70 hover:bg-brand-50")}
        >
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cx("truncate text-[15px] text-slate-900", line?.unread ? "font-bold" : "font-semibold")}>{name}</span>
              {line?.last_at ? <span className="shrink-0 text-[12px] text-slate-400">{formatDateTime(locale, line.last_at)}</span> : null}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className={cx("truncate text-[13.5px]", line?.unread ? "text-slate-800" : "text-slate-500")}>{preview}</span>
              {line?.unread ? (
                <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-ochre-500 px-1.5 text-[11.5px] font-bold text-[#12100C]">
                  {line.unread}
                </span>
              ) : null}
            </span>
          </span>
        </Link>
      </li>
    );
  };
  const teamIcon = (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ardoise text-chalk">
      <UsersRound size={18} aria-hidden />
    </span>
  );

  return (
    <>
      <PageHeader title={t.master.messages} subtitle={t.master.messagesIntro} />
      <LiveRefresh seconds={8} />
      <Card className="grid min-h-[70vh] overflow-hidden md:grid-cols-[320px_1fr]">
        <nav aria-label={t.master.messages} className={cx("border-slate-200 md:block md:border-r", chosen && "hidden")}>
          <ul className="divide-y divide-slate-100">
            {row("/platform/messages?with=team", !peer, teamIcon, t.master.wholeTeam, t.master.wholeTeamHelp, lines.get("team"))}
            {people.map((m) =>
              row(
                `/platform/messages?with=${m.user_id}`,
                peer === m.user_id,
                <Avatar name={m.full_name || m.email} size={40} />,
                m.full_name || m.email,
                m.title || (m.role === "owner" ? t.master.owner : t.master.member),
                lines.get(m.user_id),
              ),
            )}
          </ul>
          {mates.length === 0 ? (
            <div className="px-4 py-6 text-[14px] text-slate-500">
              <p className="font-semibold text-slate-700">{t.master.aloneTitle}</p>
              <p className="mt-1">
                <Link href="/platform/team" className="text-brand-600 hover:underline">
                  {t.master.aloneBody}
                </Link>
              </p>
            </div>
          ) : null}
        </nav>

        <section className={cx("min-h-[70vh] flex-col md:flex", chosen ? "flex" : "hidden")}>
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <Link href="/platform/messages" className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 md:hidden" aria-label={t.common.back}>
              <ArrowLeft size={18} aria-hidden />
            </Link>
            {active ? <Avatar name={active.full_name || active.email} size={36} /> : teamIcon}
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-semibold">{active ? active.full_name || active.email : t.master.wholeTeam}</h2>
              <p className="flex items-center gap-1.5 truncate text-[13px] text-slate-500">
                {active ? <Lock size={12} aria-hidden /> : null}
                {active ? [active.title, t.master.privateNote].filter(Boolean).join(" · ") : t.master.wholeTeamHelp}
              </p>
            </div>
          </header>
          <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />
          <ol className="flex flex-1 flex-col-reverse gap-4 overflow-y-auto bg-slate-50/40 px-4 py-5" aria-live="polite">
            {messages.length === 0 ? <li className="m-auto text-[14.5px] text-slate-500">{t.master.noMessages}</li> : null}
            {messages.map((m) => {
              const mine = m.sender_id === user.id;
              const name = (m.sender_id && nameOf.get(m.sender_id)) || "?";
              return (
                <li key={m.id} className={cx("flex gap-2.5", mine && "flex-row-reverse")}>
                  {!mine ? <Avatar name={name} size={32} /> : null}
                  <div className={cx("max-w-[78%]", mine && "text-right")}>
                    <p className="mb-1 text-[12.5px] text-slate-500">
                      <span className="font-semibold text-slate-700">{name}</span> {formatDateTime(locale, m.created_at)}
                    </p>
                    <div
                      className={cx(
                        "inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-[15px] leading-relaxed",
                        mine ? "rounded-tr-md bg-ardoise text-chalk" : "rounded-tl-md border border-slate-200 bg-paper text-slate-800",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <form action={sendTeamMessage} className="flex items-end gap-2 border-t border-slate-200 bg-paper p-3">
            <input type="hidden" name="peer" value={peer ?? ""} />
            <Textarea
              name="body"
              required
              maxLength={4000}
              placeholder={t.master.writePlaceholder}
              aria-label={t.master.writePlaceholder}
              className="min-h-12 flex-1 resize-none"
              rows={2}
            />
            <Button type="submit" aria-label={t.master.send} className="h-12 w-12 shrink-0 px-0">
              <Send size={18} aria-hidden />
            </Button>
          </form>
        </section>
      </Card>
    </>
  );
}
