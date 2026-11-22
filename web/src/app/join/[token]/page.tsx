import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, MailCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isInviteToken, schoolDirectory } from "@/lib/joining";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import type { InstitutionRole } from "@/lib/types";
import { Button, Card, Flash, buttonClass } from "@/components/ui";
import { PublicShell } from "@/components/public/public-shell";
import { acceptInvitation, signOutToInvitation } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.join.title, robots: { index: false } };
}

type Preview = {
  institution: string;
  role: InstitutionRole;
  faculty: string | null;
  department: string | null;
  full_name: string;
  email_hint: string | null;
  status: "open" | "used" | "expired" | "revoked";
} | null;

export default async function JoinPage({ params, searchParams }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const { t, locale } = await getI18n();
  const supabase = await createClient();

  // /join/<school>: the school's own link for students (e.g. /join/uba).
  if (!isInviteToken(token)) {
    const slug = token.toLowerCase().slice(0, 60);
    const school = (await schoolDirectory(supabase)).find((s) => s.slug === slug);
    if (school) {
      const { data: me } = await supabase.auth.getUser();
      redirect(me.user ? `/onboarding?school=${school.slug}` : `/login?mode=signup&school=${school.slug}`);
    }
  }

  const [{ data }, { data: auth }] = await Promise.all([
    supabase.rpc("invitation_preview", { p_token: token.slice(0, 100) }),
    supabase.auth.getUser(),
  ]);
  const v = data as Preview;
  const user = auth.user;
  const next = encodeURIComponent(`/join/${token}`);
  const errorText =
    error === "invitation_wrong_email"
      ? t.join.wrongEmail
      : typeof error === "string"
        ? ((t.errors as Record<string, string>)[error] ?? t.errors.generic)
        : null;

  const closed = !v ? t.join.invalid : v.status === "used" ? t.join.used : v.status === "expired" ? t.join.expired : v.status === "revoked" ? t.join.revoked : null;

  return (
    <PublicShell locale={locale}>
      <h1 className="font-display text-[2.4rem] font-semibold leading-tight">{t.join.title}</h1>
      {closed || !v ? (
        <Card className="mt-6 p-6 text-[15px] text-slate-700">{closed}</Card>
      ) : (
        <>
          <p className="mt-2 text-[17px] text-slate-600">{fmt(t.join.body, { institution: v.institution })}</p>
          <Flash error={errorText} />
          <Card className="mt-6 divide-y divide-slate-100">
            <div className="flex items-center gap-4 px-6 py-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ardoise text-chalk">
                <Building2 size={20} aria-hidden />
              </span>
              <div>
                <p className="font-display text-xl font-semibold">{v.institution}</p>
                <p className="text-[15px] text-slate-600">
                  {t.join.as} <strong className="text-slate-900">{t.roles[v.role]}</strong>
                  {v.department ? ` · ${v.department}` : v.faculty ? ` · ${v.faculty}` : ""}
                </p>
              </div>
            </div>
            <p className="px-6 py-4 text-[14.5px] text-slate-600">{t.roleHelp[v.role]}</p>
            {v.email_hint ? (
              <p className="flex items-center gap-2 px-6 py-4 text-[14.5px] text-slate-600">
                <MailCheck size={17} className="text-brand-600" aria-hidden />
                {fmt(t.join.forEmail, { email: v.email_hint })}
              </p>
            ) : null}
          </Card>

          {user ? (
            <div className="mt-6 space-y-3">
              <p className="flex items-center gap-2 text-[15px] text-slate-600">
                <UserRound size={17} aria-hidden />
                {fmt(t.join.signedInAs, { email: user.email ?? "" })}
              </p>
              <form action={acceptInvitation}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  {t.join.accept}
                </Button>
              </form>
              <form action={signOutToInvitation}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="text-[14px] font-semibold text-brand-600 hover:underline">
                  {t.join.notYou}
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={`/login?mode=signup&next=${next}`} className={buttonClass("primary", "lg")}>
                {t.join.createAccount}
              </Link>
              <Link href={`/login?next=${next}`} className={buttonClass("secondary", "lg")}>
                {t.join.haveAccount}
              </Link>
            </div>
          )}
        </>
      )}
      <p className="mt-10 text-[13.5px] text-slate-500">{t.auth.tagline}</p>
    </PublicShell>
  );
}
