"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

const turnstile = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

/**
 * Cloudflare Turnstile inside a sign-in, sign-up or reset form. It stays invisible unless
 * Cloudflare wants a person to tick a box, and puts its token in the form as "captcha_token"
 * for Supabase to check. Nothing renders when no site key is set.
 *
 * A token works once. So after every submission the widget is reset for a fresh token (a wrong
 * password followed by a retry must not resend the spent one), and a submission made before
 * the token is ready waits for it instead of failing.
 */
export function BotCheck({ siteKey, locale }: { siteKey?: string; locale: string }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const current = useRef("");
  // The button that submitted while the token wasn't ready yet (null: submitted without a button).
  const waiting = useRef<HTMLElement | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const ts = turnstile();
    const el = box.current;
    if (!siteKey || !loaded || !ts || !el) return;
    const resume = () => {
      const form = el.closest("form");
      if (waiting.current === undefined || !form) return;
      const submitter = waiting.current;
      waiting.current = undefined;
      form.requestSubmit(submitter ?? undefined);
    };
    const keep = (t: string) => {
      current.current = t;
      setToken(t);
    };
    widget.current = ts.render(el, {
      sitekey: siteKey,
      language: locale,
      appearance: "interaction-only",
      callback: (t: string) => {
        keep(t);
        resume();
      },
      "expired-callback": () => keep(""),
      // On failure, let a waiting submission through: the page then says the check didn't finish.
      "error-callback": () => {
        keep("");
        resume();
      },
    });
    return () => {
      if (widget.current) ts.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, loaded, locale]);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!siteKey || !form) return;
    const onSubmit = (e: SubmitEvent) => {
      if (!current.current && widget.current) {
        // Not ready yet: hold this submission until the token arrives.
        e.preventDefault();
        e.stopImmediatePropagation();
        waiting.current = (e.submitter as HTMLElement | null) ?? null;
        return;
      }
      // This submission has read the token; fetch a fresh one for the next try.
      window.setTimeout(() => {
        current.current = "";
        setToken("");
        const ts = turnstile();
        if (ts && widget.current) ts.reset(widget.current);
      }, 0);
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [siteKey]);

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
