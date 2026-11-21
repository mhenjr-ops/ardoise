import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Send } from "lucide-react";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { loadConversations } from "@/lib/inbox";
import { formatDateTime, nowMs } from "@/lib/format";
import { Avatar, Button, Card, Flash, Textarea, cx } from "@/components/ui";
import { ConversationList } from "@/components/inbox/conversation-list";
import { replyToConversation } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.inbox.title };
}

export default async function ConversationPage({ params, searchParams }: PageProps<"/inbox/[conversationId]">) {
  const { conversationId } = await params;
  const sp = await searchParams;
  const [{ supabase, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);

  const { data: conv } = await supabase.from("conversations").select("id, subject, created_at").eq("id", conversationId).maybeSingle();
  if (!conv) notFound();
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });

  const [items, { data: msgs }, { data: people }] = await Promise.all([
    loadConversations(supabase, user.id),
    supabase.from("messages").select("id, sender_id, body, created_at").eq("conversation_id", conversationId).order("created_at"),
    supabase.from("conversation_participants").select("user:profiles(id, full_name, email)").eq("conversation_id", conversationId),
  ]);
  const names = new Map<string, string>();
  for (const p of people ?? []) {
    const u = (Array.isArray(p.user) ? p.user[0] : p.user) as { id: string; full_name: string; email: string } | null;
    if (u) names.set(u.id, u.full_name || u.email);
  }
  const others = [...names.entries()].filter(([id]) => id !== user.id).map(([, n]) => n);

  return (
    <Card className="grid min-h-[70vh] overflow-hidden md:grid-cols-[360px_1fr]">
      <div className="hidden border-r border-slate-200 md:block">
        <ConversationList items={items} activeId={conversationId} t={t} locale={locale} now={nowMs()} />
      </div>
      <section className="flex min-h-[70vh] flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Link href="/inbox" className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 md:hidden" aria-label={t.common.back}>
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold">{conv.subject || t.inbox.noSubject}</h2>
            <p className="truncate text-[13.5px] text-slate-500">{others.join(", ")}</p>
          </div>
        </header>
        <Flash error={sp.error ? t.errors.forbidden : null} />
        <ol className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 px-4 py-5">
          {(msgs ?? []).map((m) => {
            const mine = m.sender_id === user.id;
            const name = m.sender_id ? names.get(m.sender_id) ?? "?" : "?";
            return (
              <li key={m.id} className={cx("flex gap-2.5", mine && "flex-row-reverse")}>
                {!mine ? <Avatar name={name} size={32} /> : null}
                <div className={cx("max-w-[78%]", mine && "text-right")}>
                  <p className="mb-1 text-[12.5px] text-slate-500">
                    <span className="font-semibold text-slate-700">{mine ? t.inbox.you : name}</span>{" "}
                    {formatDateTime(locale, m.created_at)}
                  </p>
                  <div
                    className={cx(
                      "inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-[15px] leading-relaxed",
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
        <form action={replyToConversation} className="flex items-end gap-2 border-t border-slate-200 bg-paper p-3">
          <input type="hidden" name="conversation_id" value={conversationId} />
          <Textarea name="body" required placeholder={t.inbox.replyPlaceholder} className="min-h-12 flex-1 resize-none" rows={2} />
          <Button type="submit" aria-label={t.inbox.send} className="h-12 w-12 shrink-0 px-0">
            <Send size={18} aria-hidden />
          </Button>
        </form>
      </section>
    </Card>
  );
}
