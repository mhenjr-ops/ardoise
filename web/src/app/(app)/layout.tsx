import Link from "next/link";
import { GraduationCap, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { signOut } from "@/app/actions";
import { NavLink } from "@/components/nav-link";
import { LocaleSwitch } from "@/components/locale-switch";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ profile, institution, isAdminOrRegistrar }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  const initials =
    (profile.full_name || profile.email)
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div className="min-h-screen md:flex">
      {/* Global navigation: dark rail on desktop, top bar on phones */}
      <aside className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center gap-2 bg-slate-board py-4 md:flex">
        <Link href="/dashboard" className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-600 font-bold text-white">
          A
        </Link>
        <NavLink href="/dashboard" variant="global">
          <LayoutDashboard size={20} aria-hidden />
          {t.nav.dashboard}
        </NavLink>
        <NavLink href="/results" variant="global">
          <GraduationCap size={20} aria-hidden />
          {t.nav.results}
        </NavLink>
        {isAdminOrRegistrar ? (
          <NavLink href="/admin" variant="global">
            <Settings size={20} aria-hidden />
            {t.nav.admin}
          </NavLink>
        ) : null}
        <div className="mt-auto flex flex-col items-center gap-3">
          <LocaleSwitch locale={locale} dark />
          <span
            title={profile.full_name || profile.email}
            className="grid h-9 w-9 place-items-center rounded-full bg-chalk-yellow text-xs font-bold text-slate-900"
          >
            {initials}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              title={t.common.signOut}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <LogOut size={18} aria-hidden />
              <span className="sr-only">{t.common.signOut}</span>
            </button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex items-center gap-3 bg-slate-board px-4 py-3 text-white md:hidden">
        <Link href="/dashboard" className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 font-bold">
          A
        </Link>
        <span className="truncate text-sm font-medium">{institution?.name ?? "Ardoise"}</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/results" className="rounded-md p-2 hover:bg-white/10" aria-label={t.nav.results}>
            <GraduationCap size={18} aria-hidden />
          </Link>
          {isAdminOrRegistrar ? (
            <Link href="/admin" className="rounded-md p-2 hover:bg-white/10" aria-label={t.nav.admin}>
              <Settings size={18} aria-hidden />
            </Link>
          ) : null}
          <LocaleSwitch locale={locale} dark />
          <form action={signOut}>
            <button type="submit" className="rounded-md p-2 hover:bg-white/10" aria-label={t.common.signOut}>
              <LogOut size={18} aria-hidden />
            </button>
          </form>
        </div>
      </header>

      <div className="min-w-0 flex-1">
        {institution ? (
          <div className="hidden border-b border-slate-200 bg-white px-8 py-2 text-xs text-slate-500 md:block">
            {institution.name}
          </div>
        ) : null}
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
