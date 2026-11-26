import Link from "next/link";
import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { schoolDirectory } from "@/lib/joining";
import { NDOP_CHALK } from "@/lib/ndop";
import { Button, Field, Flash, Input, Select } from "@/components/ui";
import { LocaleSwitch } from "@/components/locale-switch";
import { Wordmark } from "@/components/brand";
import { ChalkMotif } from "@/components/chalk-motif";
import { googleEnabled } from "@/lib/auth-flow";
import { GoogleMark } from "@/components/google-mark";
import {
  resendConfirmation,
  signIn,
  signInWithGoogle,
  signUp,
} from "./actions";
import { BotCheck } from "@/components/bot-check";
import { botCheckKey } from "@/lib/bot-check";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signInTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const isSignup = params.mode === "signup";
  const nextRaw = typeof params.next === "string" ? params.next : "";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "";
  const invited = next.startsWith("/join/");
  const withNext = (path: string) =>
    next
      ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`
      : path;
  const str = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string).toLowerCase() : "";

  // Students pick their university, or arrive with it set by the school's own link (/join/<school>).
  const schools =
    isSignup && !invited ? await schoolDirectory(await createClient()) : [];
  const fixed = schools.find((s) => s.slug === str("school")) ?? null;
  const picked = str("pick");
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error =
    errorKey === "invalid"
      ? isSignup
        ? t.errors.invalid
        : t.access.invalid
      : errorKey === "weak"
        ? t.auth.weakPassword
        : errorKey === "too_many"
          ? t.access.tooMany
          : errorKey === "exists"
            ? t.errors.duplicate
            : errorKey === "account_exists"
              ? t.auth.accountExists
              : errorKey === "unconfirmed"
                ? t.auth.unconfirmed
                : errorKey === "email_limit"
                  ? t.auth.emailLimit
                  : errorKey === "captcha"
                    ? t.auth.captcha
                    : errorKey === "link_expired"
                      ? t.auth.linkExpired
                      : errorKey === "google"
                        ? t.auth.googleFailed
                        : errorKey
                          ? t.errors.generic
                          : null;
  const ok =
    params.ok === "check" || params.ok === "check_invite"
      ? t.auth.checkEmail
      : params.ok === "resent"
        ? t.auth.resent
        : null;
  // Waiting for the confirmation email: offer to send it again.
  const resendTo =
    (errorKey === "unconfirmed" ||
      params.ok === "check" ||
      params.ok === "check_invite") &&
    str("email")
      ? str("email")
      : "";
  const google = await googleEnabled();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ardoise text-chalk lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{ backgroundImage: NDOP_CHALK }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,var(--color-ardoise)_75%)]"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/">
            <Wordmark dark size="lg" />
          </Link>
          <ChalkMotif className="mx-auto w-full max-w-[420px]" />
          <div>
            <p className="max-w-lg font-display text-[2.4rem] font-semibold leading-[1.1]">
              {t.landing.heroTitle}
            </p>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-chalk/70">
              {t.auth.tagline}
            </p>
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
              {isSignup
                ? invited
                  ? t.join.createAccount
                  : t.access.studentSignUp
                : t.auth.signInTitle}
            </h1>
            <p className="mb-7 mt-1.5 text-[15px] text-slate-500">
              {isSignup && !invited
                ? t.access.studentSignUpIntro
                : t.auth.tagline}
            </p>
            <Flash error={error} ok={ok} />
            {resendTo ? (
              <form action={resendConfirmation} className="-mt-2 mb-5">
                <input type="hidden" name="email" value={resendTo} />
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <BotCheck siteKey={botCheckKey()} locale={locale} />
                <button
                  type="submit"
                  className="text-[14px] font-semibold text-brand-600 hover:underline"
                >
                  {t.auth.resend}
                </button>
              </form>
            ) : null}

            {google ? (
              <>
                <form action={signInWithGoogle}>
                  {next ? (
                    <input type="hidden" name="next" value={next} />
                  ) : null}
                  <Button
                    type="submit"
                    variant="secondary"
                    size="lg"
                    className="w-full"
                  >
                    <GoogleMark />
                    {t.auth.google}
                  </Button>
                </form>
                <p className="my-5 flex items-center gap-3 text-[13px] text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">
                  {t.auth.or}
                </p>
              </>
            ) : null}

            <form action={isSignup ? signUp : signIn} className="space-y-4">
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <BotCheck siteKey={botCheckKey()} locale={locale} />
              {isSignup && !invited ? (
                fixed ? (
                  <div className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-slate-200">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ardoise text-chalk">
                      <Building2 size={18} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-slate-900">
                        {fixed.name}
                      </p>
                      <Link
                        href="/login?mode=signup"
                        className="text-[13.5px] font-semibold text-brand-600 hover:underline"
                      >
                        {t.access.notYourSchool}
                      </Link>
                    </div>
                    <input type="hidden" name="school" value={fixed.slug} />
                    <input type="hidden" name="from_link" value="1" />
                  </div>
                ) : (
                  <Field
                    label={t.access.university}
                    hint={t.access.universityHelp}
                  >
                    <Select
                      name="school"
                      required
                      defaultValue={
                        schools.some((s) => s.slug === picked) ? picked : ""
                      }
                    >
                      <option value="" disabled>
                        {t.access.chooseUniversity}
                      </option>
                      {schools.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )
              ) : null}
              {isSignup && !invited ? (
                <Field label={t.access.matricule}>
                  <Input
                    name="matricule"
                    required
                    autoCapitalize="characters"
                    autoComplete="username"
                    placeholder="UBa21E0123"
                  />
                </Field>
              ) : null}
              {isSignup ? (
                <Field
                  label={invited ? t.auth.fullName : t.access.nameAsOnRecords}
                >
                  <Input name="full_name" required autoComplete="name" />
                </Field>
              ) : null}
              {isSignup ? (
                <Field label={t.auth.email}>
                  <Input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                  />
                </Field>
              ) : (
                <Field
                  label={t.access.identifier}
                  hint={t.access.identifierHelp}
                >
                  <Input
                    name="identifier"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    defaultValue={str("email")}
                  />
                </Field>
              )}
              <Field label={t.auth.password}>
                <Input
                  name="password"
                  type="password"
                  required
                  minLength={isSignup ? 8 : undefined}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </Field>
              {!isSignup ? (
                <p className="-mt-1 text-right">
                  <Link
                    href="/login/forgot"
                    className="text-[14px] font-semibold text-brand-600 hover:underline"
                  >
                    {t.auth.forgot}
                  </Link>
                </p>
              ) : null}
              <Button type="submit" size="lg" className="w-full">
                {isSignup ? t.auth.signUp : t.auth.signIn}
              </Button>
            </form>

            <p className="mt-5 text-center text-[15px] text-slate-600">
              {isSignup ? t.auth.haveAccount : t.auth.noAccount}{" "}
              <Link
                href={
                  isSignup
                    ? withNext("/login")
                    : withNext(
                        fixed
                          ? `/login?mode=signup&school=${fixed.slug}`
                          : "/login?mode=signup",
                      )
                }
                className="font-semibold text-brand-600 hover:underline"
              >
                {isSignup
                  ? t.auth.signIn
                  : invited
                    ? t.join.createAccount
                    : t.access.studentSignUp}
              </Link>
            </p>
            {isSignup && !invited ? (
              <p className="mt-3 rounded-xl bg-paper px-4 py-3 text-center text-[14px] text-slate-600 ring-1 ring-slate-200">
                {t.access.staffNote}
              </p>
            ) : null}
            {!isSignup && !next ? (
              <p className="mt-3 text-center text-[14px] text-slate-500">
                {t.access.requestDemo}{" "}
                <Link
                  href="/request-demo"
                  className="font-semibold text-brand-600 hover:underline"
                >
                  {t.access.requestDemoLink}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
