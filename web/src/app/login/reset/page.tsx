import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { needsCode } from "@/lib/auth-flow";
import { PublicShell } from "@/components/public/public-shell";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { updatePassword } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.resetTitle };
}

/** Choose a new password, after opening the reset link (which signs the person in). */
export default async function ResetPage({ searchParams }: PageProps<"/login/reset">) {
  const [{ t, locale }, sp, supabase] = await Promise.all([getI18n(), searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login/forgot?error=link_expired");
  if (await needsCode(supabase)) redirect("/login/verify?next=/login/reset");
  const error =
    sp.error === "weak"
      ? t.auth.weakPassword
      : sp.error === "mismatch"
        ? t.auth.mismatch
        : sp.error === "same_password"
          ? t.auth.samePassword
          : sp.error
            ? t.errors.generic
            : null;

  return (
    <PublicShell locale={locale}>
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-[2.2rem] font-semibold leading-tight">{t.auth.resetTitle}</h1>
        <p className="mb-6 mt-2 text-[15.5px] text-slate-600">
          {user.email} — {t.auth.resetIntro}
        </p>
        <Flash error={error} />
        <Card className="p-6">
          <form action={updatePassword} className="space-y-4">
            <Field label={t.auth.newPassword}>
              <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label={t.auth.confirmPassword}>
              <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              {t.auth.savePassword}
            </Button>
          </form>
        </Card>
      </div>
    </PublicShell>
  );
}
