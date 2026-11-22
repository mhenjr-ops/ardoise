import { requireInstitution } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { NavLink } from "@/components/nav-link";
import { Empty, PageHeader } from "@/components/ui";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [{ institution, can }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  // Each tab appears only for the roles that can use it.
  const tabs = [
    { href: "/admin", label: t.lmd.nav.overview, show: can.manageStudents, exact: true },
    { href: "/admin/people", label: t.nav2.people, show: can.adminArea },
    { href: "/admin/students", label: t.nav2.students, show: can.manageStudents },
    { href: "/admin/structure", label: t.lmd.nav.structure, show: can.adminArea },
    { href: "/admin/enrollments", label: t.lmd.nav.enrollments, show: can.manageStudents },
    { href: "/admin/deliberations", label: t.lmd.nav.deliberations, show: can.readResults },
    { href: "/admin/policy", label: t.lmd.nav.policy, show: can.runResults },
  ].filter((tab) => tab.show);
  return (
    <>
      <PageHeader title={t.admin.title} subtitle={institution.name} />
      {can.adminArea ? (
        <>
          <nav className="-mx-4 mb-7 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {tabs.map((tab) => (
              <NavLink key={tab.href} href={tab.href} exact={tab.exact} variant="tab">
                {tab.label}
              </NavLink>
            ))}
          </nav>
          {children}
        </>
      ) : (
        <Empty>{t.admin.forbidden}</Empty>
      )}
    </>
  );
}
