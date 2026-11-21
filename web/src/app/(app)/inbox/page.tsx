import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { loadConversations } from "@/lib/inbox";
import { nowMs } from "@/lib/format";
import { NDOP_INK } from "@/lib/ndop";
import { Card } from "@/components/ui";
import { ConversationList } from "@/components/inbox/conversation-list";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.inbox.title };
}

export default async function InboxPage() {
  const [{ supabase, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  const items = await loadConversations(supabase, user.id);
  return (
    <Card className="grid min-h-[70vh] overflow-hidden md:grid-cols-[360px_1fr]">
      <div className="border-slate-200 md:border-r">
        <ConversationList items={items} t={t} locale={locale} now={nowMs()} />
      </div>
      <div className="relative hidden place-items-center md:grid">
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: NDOP_INK }} />
        <div className="relative text-center text-slate-500">
          <Inbox size={36} className="mx-auto mb-3 text-slate-300" aria-hidden />
          <p className="text-[15px]">{t.inbox.pick}</p>
        </div>
      </div>
    </Card>
  );
}
