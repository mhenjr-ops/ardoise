import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Flash, PageHeader } from "@/components/ui";
import { CatalogueBrowser } from "@/components/catalogue/catalogue-browser";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.teach.title };
}

/** Lecturers pick the courses they teach from the school's catalogue, or add one that's missing. */
export default async function AddCoursePage({ searchParams }: PageProps<"/courses/add">) {
  const [{ supabase, can, institution, memberships }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  if (!can.isStaff) redirect("/dashboard");
  const sp = await searchParams;
  const okKey = typeof sp.ok === "string" ? sp.ok : "";
  const ok = okKey === "addedTeach" ? t.catalogue.addedTeach : okKey === "added" ? t.catalogue.added : okKey === "left" ? t.teach.left : null;
  const myDepartment = memberships.find((m) => m.department_id)?.department_id ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t.teach.title} subtitle={t.teach.intro} />
      <Flash ok={ok} error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />
      <CatalogueBrowser
        supabase={supabase}
        t={t}
        institutionId={institution.id}
        mode="teach"
        basePath="/courses/add"
        searchParams={sp}
        myDepartment={myDepartment}
      />
    </div>
  );
}
