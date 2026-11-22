import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Clock3, GraduationCap, Link2, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { finishJoining, schoolDirectory } from "@/lib/joining";
import { Button, Card, Field, Flash, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { claimMatricule, disputeMatricule } from "./actions";

type Claim = { matricule: string; status: string; created_at: string; institution: { name: string; slug: string } | { name: string; slug: string }[] | null };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const [{ supabase, user, profile, institution, isPlatformAdmin }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (institution) redirect("/dashboard");
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const claim = str("claim");
  // Finish what the account was created for (an invitation or a matricule), in case the
  // confirmation email brought the person here instead of through the callback.
  if (!claim && !str("error")) {
    const target = await finishJoining(supabase, user);
    if (target) redirect(target as Parameters<typeof redirect>[0]);
  }
  const school = (str("school") || String(user.user_metadata?.school_code ?? "")).toLowerCase();
  const matricule = str("matricule") || String(user.user_metadata?.matricule ?? "");
  const schools = await schoolDirectory(supabase);

  const { data: claims } = await supabase
    .from("matricule_claims")
    .select("matricule, status, created_at, institution:institutions(name, slug)")
    .eq("user_id", user.id)
    .in("status", ["waiting", "disputed"])
    .order("created_at", { ascending: false });
  const open = ((claims ?? []) as Claim[]).map((c) => ({ ...c, institution: Array.isArray(c.institution) ? c.institution[0] : c.institution }));

  const schoolName = schools.find((s) => s.slug === school)?.name ?? school.toUpperCase();
  const messages: Record<string, string> = {
    waiting: fmt(t.onboard.waiting, { institution: schoolName }),
    taken: t.onboard.taken,
    disputed: t.onboard.disputed,
    name_mismatch: fmt(t.onboard.nameMismatch, { institution: schoolName }),
    school_not_found: t.onboard.schoolNotFound,
    too_many_attempts: t.onboard.tooMany,
  };
  const ok = claim === "waiting" || claim === "disputed" ? messages[claim] : null;
  const error = claim && !ok ? (messages[claim] ?? t.errors.generic) : errorText(t, str("error") || null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.onboard.title} subtitle={t.onboard.intro} />
      <Flash error={error} ok={ok} />

      {isPlatformAdmin ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={18} className="text-brand-600" aria-hidden />
            {t.platform.title}
          </p>
          <Link href="/platform" className={buttonClass("primary")}>
            {t.onboard.platform}
          </Link>
        </Card>
      ) : null}

      {open.length ? (
        <div className="mb-6 space-y-3">
          {open.map((c) => (
            <Card key={`${c.institution?.slug}-${c.matricule}`} className="flex items-start gap-3 border-ochre-200 bg-ochre-50/60 p-5">
              <Clock3 size={19} className="mt-0.5 shrink-0 text-ochre-700" aria-hidden />
              <div className="text-[15px]">
                <p className="font-semibold text-slate-900">{c.institution?.name}</p>
                <p className="text-slate-700">
                  {c.status === "disputed" ? t.onboard.disputed : fmt(t.onboard.waiting, { institution: c.institution?.name ?? "" })}
                </p>
                <p className="mt-1 text-[13.5px] text-slate-500">
                  {fmt(t.onboard.waitingSince, { matricule: c.matricule, date: formatDate(locale, c.created_at) })}
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1.25fr_1fr]">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <GraduationCap size={20} className="text-brand-600" aria-hidden />
            {t.onboard.studentTitle}
          </h2>
          <p className="mb-5 mt-1.5 text-[14.5px] text-slate-600">{t.onboard.studentBody}</p>
          <form action={claimMatricule} className="space-y-4">
            <Field label={t.access.university} hint={t.access.universityHelp}>
              <Select name="school" required defaultValue={schools.some((s) => s.slug === school) ? school : ""}>
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
            <Field label={t.access.matricule}>
              <Input name="matricule" required defaultValue={matricule} autoCapitalize="characters" />
            </Field>
            <Field label={t.access.nameAsOnRecords}>
              <Input name="full_name" required defaultValue={profile.full_name} autoComplete="name" />
            </Field>
            <Button type="submit">{t.onboard.link}</Button>
          </form>
          {claim === "taken" ? (
            <form action={disputeMatricule} className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="school" value={school} />
              <input type="hidden" name="matricule" value={matricule} />
              <Button type="submit" variant="secondary">
                {t.onboard.dispute}
              </Button>
            </form>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
              <Link2 size={19} className="text-brand-600" aria-hidden />
              {t.onboard.staffTitle}
            </h2>
            <p className="mt-1.5 text-[14.5px] text-slate-600">{t.onboard.staffBody}</p>
          </Card>
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
              <Building2 size={19} className="text-brand-600" aria-hidden />
              {t.onboard.newSchoolTitle}
            </h2>
            <p className="mb-4 mt-1.5 text-[14.5px] text-slate-600">{t.onboard.newSchoolBody}</p>
            <Link href="/request-demo" className={buttonClass("secondary")}>
              {t.access.requestDemoLink}
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
