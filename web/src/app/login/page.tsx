import Link from "next/link";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { Button, Field, Flash, Input } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";
import { signIn, signUp } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signInTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const isSignup = params.mode === "signup";
  const error =
    params.error === "invalid"
      ? t.auth.invalid
      : params.error === "weak"
        ? t.auth.weakPassword
        : params.error
          ? t.errors.generic
          : null;
  const ok = params.ok === "check" ? t.auth.checkEmail : null;

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-board p-10 text-chalk md:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">A</span>
          <span className="text-xl font-semibold tracking-tight">Ardoise</span>
        </div>
        <div className="space-y-4">
          <p className="max-w-md text-3xl font-semibold leading-tight">{t.auth.tagline}</p>
          <p className="max-w-md text-sm text-slate-300">
            Cours · Devoirs · Notes LMD · Français / English
          </p>
        </div>
        <svg aria-hidden className="absolute -right-10 bottom-10 h-64 w-64 opacity-20" viewBox="0 0 200 200">
          <path d="M20 150 C60 60, 120 180, 180 40" stroke="#f7f3e8" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M30 175 C80 110, 130 200, 190 90" stroke="#f2c14e" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2 md:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-bold text-white">A</span>
              <span className="font-semibold">Ardoise</span>
            </div>
            <div className="ml-auto">
              <LocaleSwitch locale={locale} />
            </div>
          </div>

          <h1 className="mb-6 text-2xl font-semibold tracking-tight">
            {isSignup ? t.auth.signUpTitle : t.auth.signInTitle}
          </h1>
          <Flash error={error} ok={ok} />

          <form action={isSignup ? signUp : signIn} className="space-y-4">
            {isSignup ? (
              <Field label={t.auth.fullName}>
                <Input name="full_name" required autoComplete="name" />
              </Field>
            ) : null}
            <Field label={t.auth.email}>
              <Input name="email" type="email" required autoComplete="email" inputMode="email" />
            </Field>
            <Field label={t.auth.password}>
              <Input
                name="password"
                type="password"
                required
                minLength={isSignup ? 8 : undefined}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </Field>
            <Button type="submit" className="w-full">
              {isSignup ? t.auth.signUp : t.auth.signIn}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {isSignup ? t.auth.haveAccount : t.auth.noAccount}{" "}
            <Link
              href={isSignup ? "/login" : "/login?mode=signup"}
              className="font-medium text-brand-700 hover:underline"
            >
              {isSignup ? t.auth.signIn : t.auth.signUpTitle}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
