"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

/**
 * Cloudflare Turnstile inside a sign-in, sign-up or reset form. It stays invisible unless
 * Cloudflare wants a person to tick a box, and puts its one-time token in the form as
 * "captcha_token" for Supabase to check. Nothing renders when no site key is set.
 */
export function BotCheck({ siteKey, locale }: { siteKey?: string; locale: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const turnstile = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!siteKey || !loaded || !turnstile || !box.current) return;
    const id = turnstile.render(box.current, {
      sitekey: siteKey,
      language: locale,
      appearance: "interaction-only",
      callback: (t: string) => setToken(t),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
    return () => turnstile.remove(id);
  }, [siteKey, loaded, locale]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
      />
      <div ref={box} />
      <input type="hidden" name="captcha_token" value={token} />
    </>
  );
}

