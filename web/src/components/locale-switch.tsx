import { setLocale } from "@/app/actions";
import type { Locale } from "@/lib/i18n/messages";

export function LocaleSwitch({ locale, dark = false }: { locale: Locale; dark?: boolean }) {
  const next: Locale = locale === "fr" ? "en" : "fr";
  return (
    <form action={setLocale}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        aria-label={next === "en" ? "Switch to English" : "Passer en français"}
        className={
          dark
            ? "rounded-md px-2 py-1 text-xs font-semibold tracking-wide text-slate-300 hover:bg-white/10 hover:text-white"
            : "rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold tracking-wide text-slate-600 hover:bg-slate-100"
        }
      >
        {locale.toUpperCase()} → {next.toUpperCase()}
      </button>
    </form>
  );
}
