import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Flash } from "@/components/ui";
import { CatalogueBrowser } from "@/components/catalogue/catalogue-browser";
import { catalogueFlash } from "@/components/catalogue/flash";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.catalogue.title };
}

/** The school's course catalogue: the registrar, administrators, deans and heads of department keep it. */
export default async function AdminCataloguePage({ searchParams }: PageProps<"/admin/catalogue">) {
  const [{ supabase, institution, can }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.adminArea) redirect("/dashboard");
  const sp = await searchParams;

  return (
    <div className="max-w-4xl">
      <h2 className="font-display text-2xl font-semibold">{t.catalogue.title}</h2>
      <p className="mb-5 mt-1.5 max-w-3xl text-[15px] leading-relaxed text-slate-600">{t.catalogue.intro}</p>
      <Flash ok={catalogueFlash(t, sp.ok)} error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />
      <CatalogueBrowser supabase={supabase} t={t} institutionId={institution.id} mode="manage" basePath="/admin/catalogue" searchParams={sp} />
    </div>
  );
}
