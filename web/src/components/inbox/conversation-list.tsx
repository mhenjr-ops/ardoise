import Link from "next/link";
import { PenSquare } from "lucide-react";
import type { ConversationSummary } from "@/lib/inbox";
import type { Locale, Messages } from "@/lib/i18n/messages";
import { timeAgo } from "@/lib/notifications";
import { Avatar, buttonClass, cx } from "@/components/ui";

export function ConversationList({
  items,
  activeId,
  t,
  locale,
  now,
}: {
  items: ConversationSummary[];
  activeId?: string;
  t: Messages;
  locale: Locale;
  now: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h1 className="font-display text-2xl font-semibold">{t.inbox.title}</h1>
        <Link href="/inbox/new" className={buttonClass("accent", "sm")}>
          <PenSquare size={15} aria-hidden />
          {t.inbox.compose}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-[15px] text-slate-500">{t.inbox.empty}</p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {items.map((c) => {
            const names = c.others.map((o) => o.name).join(", ") || t.inbox.you;
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}`}
                  aria-current={c.id === activeId ? "page" : undefined}
                  className={cx(
                    "flex gap-3 px-4 py-3.5 transition-colors",
                    c.id === activeId ? "bg-ochre-50" : "hover:bg-slate-50",
                  )}
                >
                  <Avatar name={c.others[0]?.name ?? "?"} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cx("flex-1 truncate text-[15px]", c.unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-800")}>
                        {names}
                      </span>
                      <span className="shrink-0 text-[12px] text-slate-500">{timeAgo(locale, c.last_message_at, now)}</span>
                    </span>
                    <span className={cx("block truncate text-[14px]", c.unread ? "font-semibold text-slate-800" : "text-slate-600")}>
                      {c.subject || t.inbox.noSubject}
                    </span>
                    <span className="block truncate text-[13.5px] text-slate-500">
                      {c.lastFromMe ? `${t.inbox.you}${locale === "fr" ? " : " : ": "}` : ""}
                      {c.preview}
                    </span>
                  </span>
                  {c.unread ? <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rotate-45 bg-ochre-500" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
