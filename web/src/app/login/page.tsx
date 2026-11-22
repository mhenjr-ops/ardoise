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
import { signIn, signUp } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signInTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const isSignup = params.mode === "signup";
  const nextRaw = typeof params.next === "string" ? params.next : "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "";
  const invited = next.startsWith("/join/");
  const withNext = (path: string) => (next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path);
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string).toLowerCase() : "");

  // Students pick their university, or arrive with it set by the school's own link (/join/<school>).
  const schools = isSignup && !invited ? await schoolDirectory(await createClient()) : [];
  const fixed = schools.find((s) => s.slug === str("school")) ?? null;
  const picked = str("pick");
  const error =
    params.error === "invalid"
      ? isSignup
        ? t.errors.invalid
        : t.access.invalid
      : params.error === "weak"
        ? t.auth.weakPassword
        : params.error === "too_many"
          ? t.access.tooMany
          : params.error === "exists"
            ? t.errors.duplicate
            : params.error
              ? t.errors.generic
              : null;
  const ok = params.ok === "check" ? t.auth.checkEmail : null;


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
              {isSignup ? (invited ? t.join.createAccount : t.access.studentSignUp) : t.auth.signInTitle}
            </h1>
            <p className="mb-7 mt-1.5 text-[15px] text-slate-500">
              {isSignup && !invited ? t.access.studentSignUpIntro : t.auth.tagline}
            </p>
            <Flash error={error} ok={ok} />

            <form action={isSignup ? signUp : signIn} className="space-y-4">
              {next ? <input type="hidden" name="next" value={next} /> : null}
              {isSignup && !invited ? (
                fixed ? (
                  <div className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-slate-200">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ardoise text-chalk">
                      <Building2 size={18} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-slate-900">{fixed.name}</p>
                      <Link href="/login?mode=signup" className="text-[13.5px] font-semibold text-brand-600 hover:underline">
                        {t.access.notYourSchool}
                      </Link>
                    </div>
                    <input type="hidden" name="school" value={fixed.slug} />
                    <input type="hidden" name="from_link" value="1" />
                  </div>
                ) : (
                  <Field label={t.access.university} hint={t.access.universityHelp}>
                    <Select name="school" required defaultValue={schools.some((s) => s.slug === picked) ? picked : ""}>
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
                  <Input name="matricule" required autoCapitalize="characters" autoComplete="username" placeholder="UBa21E0123" />
                </Field>
              ) : null}
              {isSignup ? (
                <Field label={invited ? t.auth.fullName : t.access.nameAsOnRecords}>
                  <Input name="full_name" required autoComplete="name" />
                </Field>
              ) : null}
              {isSignup ? (
                <Field label={t.auth.email}>
                  <Input name="email" type="email" required autoComplete="email" inputMode="email" />
                </Field>
              ) : (
                <Field label={t.access.identifier} hint={t.access.identifierHelp}>
                  <Input name="identifier" required autoComplete="username" autoCapitalize="none" />
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
              <Button type="submit" size="lg" className="w-full">
                {isSignup ? t.auth.signUp : t.auth.signIn}
              </Button>
            </form>

            <p className="mt-5 text-center text-[15px] text-slate-600">
              {isSignup ? t.auth.haveAccount : t.auth.noAccount}{" "}
              <Link
                href={isSignup ? withNext("/login") : withNext(fixed ? `/login?mode=signup&school=${fixed.slug}` : "/login?mode=signup")}
                className="font-semibold text-brand-600 hover:underline"
              >
                {isSignup ? t.auth.signIn : invited ? t.join.createAccount : t.access.studentSignUp}
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
                <Link href="/request-demo" className="font-semibold text-brand-600 hover:underline">
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
