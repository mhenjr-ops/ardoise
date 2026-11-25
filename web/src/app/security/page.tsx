import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { needsCode, safePath } from "@/lib/auth-flow";
import { formatDate } from "@/lib/format";
import { PublicShell } from "@/components/public/public-shell";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { updatePassword } from "@/app/login/actions";
import { EnrollTwoStep } from "./enroll";
import { turnOffTwoStep } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.security.link };
}

type Status = { aal: string; has_mfa: boolean; mfa_required: boolean; platform: boolean; roles: string[] };

/**
 * Two-step login and password. Outside the app's frame on purpose: accounts that must turn
 * two-step login on are sent here before anything else will load for them.
 */
export default async function SecurityPage({ searchParams }: PageProps<"/security">) {
  const [{ t, locale }, sp, supabase] = await Promise.all([getI18n(), searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await needsCode(supabase)) redirect("/login/verify?next=/security");

  const [{ data: statusData }, { data: factors }] = await Promise.all([supabase.rpc("account_status"), supabase.auth.mfa.listFactors()]);
  const status = (statusData ?? { mfa_required: false, has_mfa: false, platform: false, roles: [] }) as Status;
  const factor = factors?.totp.find((f) => f.status === "verified");
  const home = status.platform ? "/platform" : "/dashboard";
  const next = safePath(sp.next, home);

  const flash =
    sp.ok === "password" ? t.auth.resetDone : sp.ok === "off" ? t.security.off : null;
  const error =
    sp.error === "weak"
      ? t.auth.weakPassword
      : sp.error === "mismatch"
        ? t.auth.mismatch
        : sp.error === "same_password"
          ? t.auth.samePassword
          : sp.error === "required"
            ? t.security.cantTurnOff
            : sp.error
              ? t.errors.generic
              : null;

  return (
    <PublicShell locale={locale}>
      <div className="mx-auto max-w-xl space-y-6">
        {factor || !status.mfa_required ? (
          <Link href={home as "/dashboard"} className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-brand-600 hover:underline">
            <ArrowLeft size={16} aria-hidden />
            {t.security.back}
          </Link>
        ) : null}
        <div>
          <h1 className="font-display text-[2.2rem] font-semibold leading-tight">{t.security.title}</h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-slate-600">{t.security.intro}</p>
        </div>
        <Flash error={error} ok={flash} />

        {status.mfa_required && !factor ? (
          <p className="flex gap-3 rounded-2xl bg-ochre-50 px-4 py-3 text-[15px] text-slate-800 ring-1 ring-ochre-200">
            <ShieldAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-ochre-700" />
            {t.security.required}
          </p>
        ) : null}

        <Card className="p-6">
          {factor ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2.5 text-[16px] font-semibold text-slate-900">
                <ShieldCheck size={20} aria-hidden className="text-leaf-600" />
                {t.security.on}
              </p>
              <p className="text-[14px] text-slate-500">{formatDate(locale, factor.created_at)}</p>
              {status.mfa_required ? (
                <p className="text-[14px] text-slate-600">{t.security.cantTurnOff}</p>
              ) : (
                <form action={turnOffTwoStep}>
                  <input type="hidden" name="factor" value={factor.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {t.security.turnOff}
                  </Button>
                </form>
              )}
              <p className="border-t border-slate-100 pt-4 text-[13.5px] text-slate-500">{t.security.lostPhone}</p>
            </div>
          ) : (
            <EnrollTwoStep
              next={next}
              labels={{
                start: t.security.start,
                step1: t.security.step1,
                cantScan: t.security.cantScan,
                step2: t.security.step2,
                code: t.security.code,
                confirm: t.security.confirm,
                wrongCode: t.security.wrongCode,
                working: t.security.working,
                error: t.errors.generic,
              }}
            />
          )}
        </Card>

        {factor || !status.mfa_required ? (
          <Card className="p-6">
            <h2 className="mb-4 font-display text-xl font-semibold">{t.security.passwordTitle}</h2>
            <form action={updatePassword} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="from" value="security" />
              <Field label={t.auth.newPassword}>
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
              <Field label={t.auth.confirmPassword}>
                <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" variant="secondary">
                  {t.security.changePassword}
                </Button>
              </div>
            </form>
            <p className="mt-3 text-[13.5px] text-slate-500">{t.auth.resetIntro}</p>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
