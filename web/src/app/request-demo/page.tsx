import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { Button, Card, Field, Flash, Input, Textarea } from "@/components/ui";
import { PublicShell } from "@/components/public/public-shell";
import { requestDemo } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.demoRequest.title };
}

export default async function RequestDemoPage({ searchParams }: PageProps<"/request-demo">) {
  const { t, locale } = await getI18n();
  const { sent, error } = await searchParams;
  const errorText = error === "too_many" ? t.demoRequest.tooMany : error === "invalid" ? t.errors.invalid : error ? t.errors.generic : null;

  return (
    <PublicShell locale={locale}>
      <h1 className="font-display text-[2.4rem] font-semibold leading-tight">{t.demoRequest.title}</h1>
      <p className="mt-2 max-w-xl text-[17px] text-slate-600">{t.demoRequest.intro}</p>
      {sent ? (
        <Card className="mt-8 flex items-start gap-3 p-6">
          <CheckCircle2 className="mt-0.5 shrink-0 text-leaf-500" aria-hidden />
          <p className="text-[16px] text-slate-800">{t.demoRequest.sent}</p>
        </Card>
      ) : (
        <Card className="mt-8 p-6">
          <Flash error={errorText} />
          <form action={requestDemo} className="grid gap-4 sm:grid-cols-2">
            <Field label={t.demoRequest.fullName}>
              <Input name="full_name" required autoComplete="name" maxLength={200} />
            </Field>
            <Field label={t.demoRequest.jobTitle} hint={t.demoRequest.jobTitleHelp}>
              <Input name="job_title" autoComplete="organization-title" maxLength={200} />
            </Field>
            <Field label={t.demoRequest.institution}>
              <Input name="institution" required autoComplete="organization" maxLength={200} />
            </Field>
            <Field label={t.demoRequest.city}>
              <Input name="city" autoComplete="address-level2" maxLength={120} />
            </Field>
            <Field label={t.demoRequest.email}>
              <Input name="email" type="email" required autoComplete="email" maxLength={320} />
            </Field>
            <Field label={t.demoRequest.phone}>
              <Input name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="+237 6…" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.demoRequest.message}>
                <Textarea name="message" rows={4} maxLength={4000} />
              </Field>
            </div>
            <div aria-hidden className="hidden">
              <input name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="lg">
                {t.demoRequest.submit}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </PublicShell>
  );
}
