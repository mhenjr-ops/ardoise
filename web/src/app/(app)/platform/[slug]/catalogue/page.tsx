import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Flash, PageHeader } from "@/components/ui";
import { CatalogueBrowser } from "@/components/catalogue/catalogue-browser";
import { catalogueFlash } from "@/components/catalogue/flash";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.catalogue.title };
}

/** The Ardoise team keeps a university's catalogue: imports its course list and adds missing departments. */
export default async function PlatformCataloguePage({ params, searchParams }: PageProps<"/platform/[slug]/catalogue">) {
  const [{ supabase, isPlatformAdmin }, { t }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const { slug } = await params;
  const sp = await searchParams;
  const { data: school } = await supabase.from("institutions").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!school) notFound();

  return (
    <div className="max-w-4xl">
      <Link href={`/platform/${school.slug}`} className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={15} aria-hidden />
        {school.name}
      </Link>
      <PageHeader title={t.catalogue.title} subtitle={t.catalogue.intro} />
      <Flash ok={catalogueFlash(t, sp.ok)} error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />
      <CatalogueBrowser
        supabase={supabase}
        t={t}
        institutionId={school.id}
        mode="manage"
        basePath={`/platform/${school.slug}/catalogue`}
        searchParams={sp}
        isTeam
      />
    </div>
  );
}
