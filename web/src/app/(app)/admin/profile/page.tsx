import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Empty, Flash } from "@/components/ui";
import { SchoolLookCard, type SchoolProfile } from "@/components/school-look-card";

/** The university's own logo, colour, short name, city and website. */
export default async function SchoolProfilePage({ searchParams }: PageProps<"/admin/profile">) {
  const [{ supabase, institution, can }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.manageSchool) return <Empty>{t.admin.forbidden}</Empty>;
  const { error, ok } = await searchParams;
  const { data } = await supabase
    .from("institutions")
    .select("id, name, short_name, brand_color, logo_path, city, website")
    .eq("id", institution.id)
    .maybeSingle();
  if (!data) return <Empty>{t.admin.forbidden}</Empty>;
  return (
    <div className="max-w-2xl">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />
      <SchoolLookCard school={data as SchoolProfile} back="/admin/profile" t={t} />
    </div>
  );
}
