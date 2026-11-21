import Link from "next/link";
import type { Metadata } from "next";
import { BookOpenCheck, GraduationCap, School } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { DEMO_ENABLED } from "@/lib/demo";
import { NDOP_CHALK } from "@/lib/ndop";
import { Button, Field, Flash, Input } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";
import { Wordmark } from "@/components/brand";
import { ChalkMotif } from "@/components/chalk-motif";
import { demoSignIn, signIn, signUp } from "./actions";

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

  const demoRoles = [
    { role: "admin", label: t.demo.admin, icon: <School size={18} aria-hidden /> },
    { role: "teacher", label: t.demo.teacher, icon: <BookOpenCheck size={18} aria-hidden /> },
    { role: "student", label: t.demo.student, icon: <GraduationCap size={18} aria-hidden /> },
  ];

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ardoise text-chalk lg:block">
        <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: NDOP_CHALK }} />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,var(--color-ardoise)_75%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/">
            <Wordmark dark size="lg" />
          </Link>
          <ChalkMotif className="mx-auto w-full max-w-[420px]" />
          <div>
            <p className="max-w-lg font-display text-[2.4rem] font-semibold leading-[1.1]">{t.landing.heroTitle}</p>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-chalk/70">{t.auth.tagline}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col bg-sand">
        <div className="flex items-center justify-between px-6 py-5">
          <Link href="/" className="lg:invisible">
            <Wordmark />
          </Link>
          <LocaleSwitch locale={locale} />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-[400px]">
            <h1 className="font-display text-[2.2rem] font-semibold leading-tight">
              {isSignup ? t.auth.signUpTitle : t.auth.signInTitle}
            </h1>
            <p className="mb-7 mt-1.5 text-[15px] text-slate-500">{t.auth.tagline}</p>
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
              <Button type="submit" size="lg" className="w-full">
                {isSignup ? t.auth.signUp : t.auth.signIn}
              </Button>
            </form>

            <p className="mt-5 text-center text-[15px] text-slate-600">
              {isSignup ? t.auth.haveAccount : t.auth.noAccount}{" "}
              <Link href={isSignup ? "/login" : "/login?mode=signup"} className="font-semibold text-brand-600 hover:underline">
                {isSignup ? t.auth.signIn : t.auth.signUpTitle}
              </Link>
            </p>

            {DEMO_ENABLED && !isSignup ? (
              <div id="demo" className="mt-9 rounded-2xl border border-ochre-200 bg-ochre-50/70 p-5">
                <p className="font-display text-xl font-semibold">{t.demo.title}</p>
                <p className="mt-1 text-[14px] text-slate-600">{t.demo.body}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {demoRoles.map((d) => (
                    <form key={d.role} action={demoSignIn}>
                      <input type="hidden" name="role" value={d.role} />
                      <button
                        type="submit"
                        className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-paper px-2 py-3 text-[13.5px] font-semibold text-slate-800 transition-colors hover:border-ardoise hover:bg-white"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-ardoise text-chalk">{d.icon}</span>
                        {d.label}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
