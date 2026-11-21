"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookCheck,
  CalendarCheck2,
  ClipboardList,
  GraduationCap,
  Inbox,
  Megaphone,
  MessagesSquare,
  NotebookPen,
} from "lucide-react";
import type { Locale, Messages } from "@/lib/i18n/messages";
import { notificationText, timeAgo } from "@/lib/notifications";
import type { AppNotification, NotificationKind } from "@/lib/types";

const kindIcon: Record<NotificationKind, typeof Bell> = {
  announcement: Megaphone,
  assignment: NotebookPen,
  grade: BookCheck,
  submission: ClipboardList,
  message: Inbox,
  discussion: MessagesSquare,
  results: GraduationCap,
  attendance: CalendarCheck2,
};

type Labels = { title: string; markAllRead: string; seeAll: string; empty: string };

export function NotificationBell({
  initialUnread,
  templates,
  locale,
  labels,
  tone = "light",
}: {
  initialUnread: number;
  templates: Messages["notif"];
  locale: Locale;
  labels: Labels;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [now, setNow] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const json = (await res.json()) as { items: AppNotification[]; unread: number };
      setItems(json.items);
      setUnread(json.unread);
      setNow(Date.now());
    } catch {
      /* offline: keep what we have */
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    setItems((list) => list?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    setUnread(0);
    await fetch("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) });
    router.refresh();
  }

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      void fetch("/api/notifications", { method: "POST", body: JSON.stringify({ id: n.id }) });
    }
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={`${labels.title}${unread ? ` (${unread})` : ""}`}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors ${
          tone === "dark" ? "text-chalk/90 hover:bg-white/10" : "text-slate-600 hover:bg-slate-900/5"
        }`}
      >
        <Bell size={19} aria-hidden />
        {unread > 0 ? (
          <span className="num absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ochre-500 px-1 text-[10.5px] font-extrabold text-slate-950 ring-2 ring-sand">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-paper text-slate-900 shadow-float">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="font-display text-lg font-semibold">{labels.title}</span>
            {unread > 0 ? (
              <button type="button" onClick={markAll} className="text-[13px] font-semibold text-brand-600 hover:underline">
                {labels.markAllRead}
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <li className="space-y-2 p-4" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </li>
            ) : items.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-slate-500">{labels.empty}</li>
            ) : (
              items.map((n) => {
                const Icon = kindIcon[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50"
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                          n.read_at ? "bg-slate-100 text-slate-500" : "bg-ardoise text-chalk"
                        }`}
                      >
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14.5px] leading-snug ${n.read_at ? "text-slate-600" : "font-semibold text-slate-900"}`}>
                          {notificationText(templates, locale, n)}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-slate-500">{timeAgo(locale, n.created_at, now)}</span>
                      </span>
                      {!n.read_at ? <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rotate-45 bg-ochre-500" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-200 px-4 py-2.5 text-center text-[13.5px] font-semibold text-brand-600 hover:bg-slate-50"
          >
            {labels.seeAll}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
