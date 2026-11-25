import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { needsCode, safePath, signInTarget } from "@/lib/auth-flow";
import { PublicShell } from "@/components/public/public-shell";
import { Button, Card, Field, Flash, Input } from "@/components/ui";
import { signOut } from "@/app/actions";
import { verifyCode } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.security.verifyTitle };
}

/** Second step of signing in: the 6-digit code from the authenticator app. */
export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const [{ t, locale }, sp, supabase] = await Promise.all([getI18n(), searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = safePath(sp.next);
  if (!user) redirect("/login");
  if (!(await needsCode(supabase))) redirect(await signInTarget(supabase, next));
  const error = sp.error === "code" ? t.security.wrongCode : sp.error === "too_many" ? t.auth.emailLimit : null;

  return (
    <PublicShell locale={locale}>
      <div className="mx-auto max-w-md">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-ardoise text-chalk">
          <ShieldCheck size={22} aria-hidden />
        </span>
        <h1 className="font-display text-[2.2rem] font-semibold leading-tight">{t.security.verifyTitle}</h1>
        <p className="mb-6 mt-2 text-[15.5px] leading-relaxed text-slate-600">{t.security.verifyIntro}</p>
        <Flash error={error} />
        <Card className="p-6">
          <form action={verifyCode} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <Field label={t.security.code}>
              <Input
                name="code"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                className="text-center font-mono text-2xl tracking-[0.4em]"
              />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              {t.security.verify}
            </Button>
          </form>
        </Card>
        <form action={signOut} className="mt-5 text-center">
          <button type="submit" className="text-[14.5px] font-semibold text-slate-600 hover:underline">
            {user.email} · {t.security.otherAccount}
          </button>
        </form>
        <p className="mt-6 text-center text-[13.5px] text-slate-500">{t.security.lostPhone}</p>
      </div>
    </PublicShell>
  );
}
