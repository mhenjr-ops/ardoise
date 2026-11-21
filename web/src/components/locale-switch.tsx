import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions";
import type { Locale } from "@/lib/i18n/messages";

/** Switches between French and English; shows the language you'd switch to. */
export function LocaleSwitch({ locale, dark = false }: { locale: Locale; dark?: boolean }) {
  const next: Locale = locale === "fr" ? "en" : "fr";
  return (
    <form action={setLocale}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        aria-label={next === "en" ? "Switch to English" : "Passer en français"}
        title={next === "en" ? "Switch to English" : "Passer en français"}
        className={
          dark
            ? "flex h-10 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold text-chalk/85 hover:bg-white/10"
            : "flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-slate-600 hover:bg-slate-900/5"
        }
      >
        <Languages size={16} aria-hidden />
        {next.toUpperCase()}
      </button>
    </form>
  );
}
