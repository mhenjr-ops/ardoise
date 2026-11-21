import type { Locale, Messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages-engage";
import type { AppNotification } from "@/lib/types";

/** Renders a notification in the reader's language. */
export function notificationText(templates: Messages["notif"], locale: Locale, n: Pick<AppNotification, "kind" | "data">): string {
  const data = { ...n.data };
  for (const key of ["score", "points"]) {
    const v = data[key];
    if (typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(Number(v)))) {
      data[key] = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 }).format(Number(v));
    }
  }
  return fmt(templates[n.kind] ?? "", data);
}

/** "il y a 5 min" / "5 min ago" */
export function timeAgo(locale: Locale, iso: string, now: number): string {
  const diff = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "fr" ? "fr" : "en", { numeric: "auto", style: "short" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return rtf.format(Math.round(diff / (86400 * 30)), "month");
}
