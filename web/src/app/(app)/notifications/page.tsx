import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { getSession, actionSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { notificationText, timeAgo } from "@/lib/notifications";
import { nowMs } from "@/lib/format";
import { watDayKey, formatDayLabel } from "@/lib/calendar";
import { Button, Card, Empty, PageHeader, cx } from "@/components/ui";
import type { AppNotification } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.shell.notifications };
}

async function markAllRead() {
  "use server";
  const { supabase, user } = await actionSession();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const [{ supabase, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, data, link, course_id, created_at, read_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as AppNotification[];
  const now = nowMs();
  const groups = new Map<string, AppNotification[]>();
  for (const n of items) {
    const key = watDayKey(n.created_at);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t.shell.notifications}
        action={
          items.some((n) => !n.read_at) ? (
            <form action={markAllRead}>
              <Button type="submit" variant="secondary" size="sm">
                {t.shell.markAllRead}
              </Button>
            </form>
          ) : null
        }
      />
      {items.length === 0 ? (
        <Empty>{t.shell.noNotifications}</Empty>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-[13.5px] font-bold capitalize text-slate-500">
                {formatDayLabel(locale, day, { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <Card>
                <ul className="divide-y divide-slate-100">
                  {list.map((n) => (
                    <li key={n.id}>
                      <Link href={n.link ?? "/dashboard"} className="flex gap-3 px-5 py-3.5 hover:bg-slate-50">
                        <span aria-hidden className={cx("mt-2 h-2 w-2 shrink-0 rotate-45", n.read_at ? "bg-slate-300" : "bg-ochre-500")} />
                        <span className="min-w-0 flex-1">
                          <span className={cx("block text-[15px] leading-snug", n.read_at ? "text-slate-600" : "font-semibold text-slate-900")}>
                            {notificationText(t.notif, locale, n)}
                          </span>
                          <span className="text-[12.5px] text-slate-500">{timeAgo(locale, n.created_at, now)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
