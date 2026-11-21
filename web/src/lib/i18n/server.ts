import "server-only";
import { cookies } from "next/headers";
import { isLocale, messages, type Locale, type Messages } from "./messages";

export const LOCALE_COOKIE = "ardoise_locale";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export async function getI18n(): Promise<{ locale: Locale; t: Messages }> {
  const locale = await getLocale();
  return { locale, t: messages[locale] };
}

/** Maps a database or action error code to a translated message. */
export function errorText(t: Messages, code: string | undefined | null): string | null {
  if (!code) return null;
  const known = t.errors as Record<string, string>;
  return known[code] ?? t.errors.generic;
}
