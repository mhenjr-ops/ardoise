import Link from "next/link";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { PublicShell } from "@/components/public/public-shell";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { requestReset } from "../actions";
import { BotCheck } from "@/components/bot-check";
import { botCheckKey } from "@/lib/bot-check";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.forgotTitle };
}

/** Forgot password: a link by email to choose a new one. */
export default async function ForgotPage({ searchParams }: PageProps<"/login/forgot">) {
  const [{ t, locale }, sp] = await Promise.all([getI18n(), searchParams]);
  const email = typeof sp.email === "string" ? sp.email.slice(0, 320) : "";
  const error =
    sp.error === "email_limit"
      ? t.auth.emailLimit
      : sp.error === "captcha"
        ? t.auth.captcha
        : sp.error === "link_expired"
          ? t.auth.linkExpired
          : sp.error
            ? t.errors.invalid
            : null;

  return (
    <PublicShell locale={locale}>
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-[2.2rem] font-semibold leading-tight">{t.auth.forgotTitle}</h1>
        <p className="mb-6 mt-2 text-[15.5px] leading-relaxed text-slate-600">{t.auth.forgotIntro}</p>
        <Flash error={error} ok={sp.sent ? t.auth.linkSent : null} />
        <Card className="p-6">
          <form action={requestReset} className="space-y-4">
            <BotCheck siteKey={botCheckKey()} locale={locale} />
            <Field label={t.auth.email}>
              <Input name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={email} />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              {t.auth.sendLink}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-[14px] leading-relaxed text-slate-500">{t.auth.forgotHelp}</p>
        <p className="mt-6 text-center">
          <Link href="/login" className="text-[15px] font-semibold text-brand-600 hover:underline">
            {t.auth.backToSignIn}
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
