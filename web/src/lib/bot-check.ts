/** The Cloudflare Turnstile site key, when bot protection is on (NEXT_PUBLIC_TURNSTILE_SITE_KEY). */
export function botCheckKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;
}

/** The token the bot check put in the form, for Supabase Auth (undefined when bot protection is off). */
export function captchaToken(formData: FormData): string | undefined {
  const t = String(formData.get("captcha_token") ?? "").trim().slice(0, 4096);
  return t || undefined;
}
