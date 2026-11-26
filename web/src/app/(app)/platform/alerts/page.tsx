import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { markAlertSeen, markAllAlertsSeen } from "./actions";

type Alert = {
  id: number;
  kind: string;
  severity: "info" | "warning" | "critical";
  detail: Record<string, string | number | null>;
  occurrences: number;
  created_at: string;
  last_seen_at: string;
  seen_at: string | null;
  institution: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

/** One line in plain words for each kind of alert. */
function describe(a: Alert, t: Messages): string {
  const d = a.detail;
  const v = (k: string) => String(d[k] ?? "?");
  switch (a.kind) {
    case "app_error":
      return fmt(t.alerts.appError, { path: v("path") });
    case "mark_changes":
      return fmt(t.alerts.markChanges, { who: v("who"), count: v("count") });
    case "privileged_role": {
      const role = t.roles[v("role") as keyof typeof t.roles] ?? v("role");
      const line = fmt(t.alerts.privilegedRole, { who: v("who"), role });
      return d.by ? `${line} (${fmt(t.alerts.by, { by: v("by") })})` : line;
    }
    case "team_change":
      return fmt(d.action === "left" ? t.alerts.teamLeft : t.alerts.teamJoined, { who: v("who") });
    case "login_attack":
      return fmt(t.alerts.loginAttack, { count: v("count"), matricule: v("matricule") });
    case "login_flood":
      return fmt(t.alerts.loginFlood, { count: v("count") });
    case "join_attack":
      return fmt(t.alerts.joinAttack, { who: v("who"), count: v("count") });
    default:
      return a.kind;
  }
}

const TONE = { info: "neutral", warning: "warn", critical: "danger" } as const;

/** Site errors and unusual activity, for the Ardoise team. */
export default async function AlertsPage({ searchParams }: PageProps<"/platform/alerts">) {
  const [{ supabase, isPlatformAdmin }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const showAll = (await searchParams).show === "all";
  let query = supabase
    .from("alerts")
    .select("id, kind, severity, detail, occurrences, created_at, last_seen_at, seen_at, institution:institutions(name, slug)")
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (!showAll) query = query.is("seen_at", null);
  const { data } = await query;
  const alerts = (data ?? []) as Alert[];

  return (
    <>
      <PageHeader
        title={t.alerts.title}
        subtitle={t.alerts.intro}
        action={
          !showAll && alerts.length ? (
            <form action={markAllAlertsSeen}>
              <Button type="submit" variant="secondary" size="sm">
                {t.alerts.markAll}
              </Button>
            </form>
          ) : null
        }
      />
      <nav className="mb-5 flex gap-2">
        {[
          { href: "/platform/alerts", label: t.alerts.unseen, on: !showAll },
          { href: "/platform/alerts?show=all", label: t.alerts.all, on: showAll },
        ].map((x) => (
          <Link
            key={x.href}
            href={x.href as "/platform/alerts"}
            aria-current={x.on ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-[13.5px] font-semibold ring-1 ${
              x.on ? "bg-ardoise text-chalk ring-ardoise" : "bg-paper text-slate-700 ring-slate-200 hover:ring-ardoise"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {alerts.length ? (
        <Card className="divide-y divide-slate-100">
          {alerts.map((a) => {
            const school = Array.isArray(a.institution) ? a.institution[0] : a.institution;
            return (
              <div key={a.id} className={`flex flex-wrap items-start gap-3 px-5 py-4 ${a.seen_at ? "opacity-60" : ""}`}>
                <Badge tone={TONE[a.severity]}>{t.alerts[a.severity]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-slate-900">{describe(a, t)}</p>
                  {a.kind === "app_error" && a.detail.message ? (
                    <p className="mt-1 break-words font-mono text-[12.5px] text-slate-600">{String(a.detail.message)}</p>
                  ) : null}
                  <p className="mt-1 text-[13px] text-slate-500">
                    {school ? (
                      <Link href={`/platform/${school.slug}`} className="font-semibold text-brand-600 hover:underline">
                        {school.name}
                      </Link>
                    ) : (
                      t.alerts.platform
                    )}{" "}
                    · {formatDateTime(locale, a.created_at)}
                    {a.occurrences > 1
                      ? ` · ${fmt(t.alerts.times, { n: a.occurrences })} · ${fmt(t.alerts.last, { date: formatDateTime(locale, a.last_seen_at) })}`
                      : ""}
                  </p>
                </div>
                {a.seen_at ? null : (
                  <form action={markAlertSeen}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      {t.alerts.markSeen}
                    </Button>
                  </form>
                )}
              </div>
            );
          })}
        </Card>
      ) : (
        <Card className="p-6">
          <Empty>{t.alerts.none}</Empty>
        </Card>
      )}
    </>
  );
}
