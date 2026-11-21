import { requireInstitution } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { NavLink } from "@/components/nav-link";
import { Empty, PageHeader } from "@/components/ui";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [{ institution, isAdminOrRegistrar }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  return (
    <>
      <PageHeader title={t.admin.title} subtitle={institution.name} />
      {isAdminOrRegistrar ? (
        <>
          <nav className="-mx-4 mb-7 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            <NavLink href="/admin" exact variant="tab">
              {t.lmd.nav.overview}
            </NavLink>
            <NavLink href="/admin/structure" variant="tab">
              {t.lmd.nav.structure}
            </NavLink>
            <NavLink href="/admin/enrollments" variant="tab">
              {t.lmd.nav.enrollments}
            </NavLink>
            <NavLink href="/admin/deliberations" variant="tab">
              {t.lmd.nav.deliberations}
            </NavLink>
            <NavLink href="/admin/policy" variant="tab">
              {t.lmd.nav.policy}
            </NavLink>
          </nav>
          {children}
        </>
      ) : (
        <Empty>{t.admin.forbidden}</Empty>
      )}
    </>
  );
}
