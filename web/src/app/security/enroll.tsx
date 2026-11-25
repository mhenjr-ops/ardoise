"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

type Labels = {
  start: string;
  step1: string;
  cantScan: string;
  step2: string;
  code: string;
  confirm: string;
  wrongCode: string;
  working: string;
  error: string;
};

/**
 * Turning on two-step login: the authenticator app scans a QR code (or takes the key by hand),
 * then the first code it shows proves it is set up. Runs in the browser, so the secret never
 * passes through our server.
 */
export function EnrollTwoStep({ labels, next }: { labels: Labels; next: string }) {
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // An earlier attempt left half-done is cleared first.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: e } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Ardoise",
      friendlyName: `Ardoise ${new Date().toISOString().slice(0, 16)}`,
    });
    setBusy(false);
    if (e || !data) {
      setError(labels.error);
      return;
    }
    setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code: code.replace(/\s/g, "") });
    if (e) {
      setBusy(false);
      setError(labels.wrongCode);
      return;
    }
    // The session now carries the "code entered" mark; reload so every page sees it.
    window.location.assign(next);
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        {error ? <p className="text-[14.5px] font-semibold text-terracotta-700">{error}</p> : null}
        <Button type="button" size="lg" onClick={start} disabled={busy}>
          {busy ? labels.working : labels.start}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-5">
      <div className="grid items-start gap-5 sm:grid-cols-[180px_1fr]">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          {/* The QR code comes from Supabase as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="" width={156} height={156} className="h-[156px] w-[156px]" />
        </div>
        <div className="space-y-3 text-[15px] text-slate-700">
          <p>
            <strong className="text-slate-900">1.</strong> {labels.step1}
          </p>
          <p className="text-[13.5px] text-slate-500">{labels.cantScan}</p>
          <p className="select-all break-all rounded-lg bg-paper px-3 py-2 font-mono text-[13.5px] text-slate-800 ring-1 ring-slate-200">
            {setup.secret}
          </p>
          <p>
            <strong className="text-slate-900">2.</strong> {labels.step2}
          </p>
        </div>
      </div>
      <Field label={labels.code}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="max-w-[220px] text-center font-mono text-2xl tracking-[0.4em]"
        />
      </Field>
      {error ? <p className="text-[14.5px] font-semibold text-terracotta-700">{error}</p> : null}
      <Button type="submit" size="lg" disabled={busy || code.replace(/\s/g, "").length !== 6}>
        {busy ? labels.working : labels.confirm}
      </Button>
    </form>
  );
}
