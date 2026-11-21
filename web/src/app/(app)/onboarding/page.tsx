import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Button, Card, Field, Flash, Input, PageHeader } from "@/components/ui";
import { createInstitution } from "./actions";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const [{ institution }, { t }] = await Promise.all([getSession(), getI18n()]);
  if (institution) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.onboarding.title} subtitle={t.onboarding.intro} />
      <Flash error={errorText(t, typeof error === "string" ? error : null)} />
      <div className="grid gap-6">
        <Card className="p-5 text-sm text-slate-700">{t.onboarding.waiting}</Card>
        <Card className="p-5">
          <h2 className="text-base font-semibold">{t.onboarding.createTitle}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">{t.onboarding.createIntro}</p>
          <form action={createInstitution} className="space-y-4">
            <Field label={t.onboarding.name}>
              <Input name="name" required placeholder="Institut Supérieur de Yaoundé" />
            </Field>
            <Field label={t.onboarding.slug} hint={t.onboarding.slugHelp}>
              <Input name="slug" required pattern="[a-z0-9-]{2,60}" placeholder="isy-yaounde" />
            </Field>
            <Button type="submit">{t.onboarding.create}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
