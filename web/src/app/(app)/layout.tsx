import Link from "next/link";
import {
  CalendarDays,
  GraduationCap,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { getSession } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { NDOP_CHALK } from "@/lib/ndop";
import { signOut } from "@/app/actions";
import { LocaleSwitch } from "@/components/locale-switch";
import { Avatar } from "@/components/ui";
import { LogoMark, Wordmark } from "@/components/brand";
import { CommandPalette } from "@/components/shell/command-palette";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SidebarNav, TabBar, type NavCourse, type NavItem } from "@/components/shell/nav";

type CourseRow = { course: NavCourse | NavCourse[] | null };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ supabase, user, profile, institution, can, roles, isPlatformAdmin }, { t, locale }] = await Promise.all([
    getSession(),
    getI18n(),
  ]);

  const [{ data: enrolled }, { count: unreadNotifications }, { data: unreadInbox }] = await Promise.all([
    supabase.from("enrollments").select("course:courses(id, code, title, color)").eq("user_id", user.id),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    supabase.rpc("inbox_unread_count"),
  ]);
  let courses = ((enrolled ?? []) as CourseRow[])
    .map((r) => (Array.isArray(r.course) ? r.course[0] : r.course))
    .filter((c): c is NavCourse => !!c)
    .sort((a, b) => a.code.localeCompare(b.code));
  // Only the courses this person teaches or studies: an administrator's sidebar is not the
  // school's course list (that's Admin → Courses, with search).
  const inboxBadge = typeof unreadInbox === "number" ? unreadInbox : 0;

  const items: NavItem[] = [];
  let listLabel = t.dashboard.myCourses;
  if (isPlatformAdmin) {
    // The master account: every university, nothing of any one school's own.
    const [{ count: openChanges }, { count: openDemos }, { data: unreadTeam }] = await Promise.all([
      supabase.from("support_requests").select("id", { count: "exact", head: true }).is("handled_at", null),
      supabase.from("demo_requests").select("id", { count: "exact", head: true }).is("handled_at", null),
      supabase.rpc("team_unread_count"),
    ]);
    items.push(
      { href: "/platform", label: t.master.overview, icon: <ShieldCheck size={19} aria-hidden />, exact: true },
      {
        href: "/platform/requests",
        label: t.master.requests,
        icon: <MessageSquareText size={19} aria-hidden />,
        badge: (openChanges ?? 0) + (openDemos ?? 0),
      },
      {
        href: "/platform/messages",
        label: t.master.messages,
        icon: <MessagesSquare size={19} aria-hidden />,
        badge: (unreadTeam as number | null) ?? 0,
      },
      { href: "/platform/team", label: t.master.team, icon: <UsersRound size={19} aria-hidden /> },
    );
    const { data: schools } = await supabase.from("institutions").select("id, name, slug").order("name");
    courses = ((schools ?? []) as Array<{ id: string; name: string; slug: string }>).map((s) => ({
      id: s.id,
      code: s.slug.toUpperCase(),
      title: s.name,
      color: "#C9A227",
      href: `/platform/${s.slug}`,
    }));
    listLabel = t.master.universities;
  } else {
    items.push(
      { href: "/dashboard", label: t.nav.dashboard, icon: <LayoutDashboard size={19} aria-hidden /> },
      { href: "/calendar", label: t.shell.calendar, icon: <CalendarDays size={19} aria-hidden /> },
      { href: "/inbox", label: t.shell.inbox, icon: <Inbox size={19} aria-hidden />, badge: inboxBadge },
    );
    if (roles.includes("student")) {
      items.push({ href: "/results", label: t.nav.results, icon: <GraduationCap size={19} aria-hidden /> });
    }
    if (can.adminArea) {
      items.push({ href: "/admin", label: t.nav.admin, icon: <Settings2 size={19} aria-hidden /> });
    }
  }
  const displayName = profile.full_name || profile.email;
  const topRole = (["owner", "admin", "registrar", "dean", "hod", "teacher", "student"] as const).find((r) => roles.includes(r));
  const roleLabel = isPlatformAdmin ? t.master.role : topRole ? t.roles[topRole] : "";
  const paletteLabels = {
    search: t.shell.search,
    placeholder: t.shell.searchPlaceholder,
    empty: t.shell.searchEmpty,
    hint: t.shell.searchHint,
    close: t.shell.close,
  };
  const bellLabels = {
    title: t.shell.notifications,
    markAllRead: t.shell.markAllRead,
    seeAll: t.shell.seeAll,
    empty: t.shell.noNotifications,
  };

  return (
    <div className="min-h-screen md:pl-[264px]">
      {/* Desktop: the slate */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-ardoise text-chalk md:flex">
        <div className="relative overflow-hidden border-b border-white/10 px-5 pb-5 pt-6">
          <div aria-hidden className="absolute inset-0 opacity-90" style={{ backgroundImage: NDOP_CHALK, backgroundSize: "72px 72px" }} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-ardoise/40 to-ardoise" />
          <Link href={isPlatformAdmin ? "/platform" : "/dashboard"} className="relative block">
            <Wordmark dark />
          </Link>
          {institution ? (
            <p className="relative mt-3 line-clamp-2 text-[13px] leading-snug text-chalk/65">{institution.name}</p>
          ) : isPlatformAdmin ? (
            <p className="relative mt-3 text-[13px] leading-snug text-chalk/65">{t.master.subtitle}</p>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col pt-4">
          <SidebarNav items={items} courses={courses} coursesLabel={listLabel} />
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
          <Avatar name={displayName} size={36} className="ring-2 ring-white/15" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{displayName}</p>
            <p className="truncate text-[12.5px] text-chalk/55">{roleLabel}</p>
          </div>
          <Link
            href="/security"
            title={t.security.link}
            className="grid h-9 w-9 place-items-center rounded-full text-chalk/70 hover:bg-white/10 hover:text-chalk"
          >
            <KeyRound size={17} aria-hidden />
            <span className="sr-only">{t.security.link}</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              title={t.common.signOut}
              className="grid h-9 w-9 place-items-center rounded-full text-chalk/70 hover:bg-white/10 hover:text-chalk"
            >
              <LogOut size={17} aria-hidden />
              <span className="sr-only">{t.common.signOut}</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Desktop: top bar */}
      <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-slate-200/70 bg-sand/85 px-8 backdrop-blur md:flex">
        <CommandPalette labels={paletteLabels} />
        <div className="ml-auto flex items-center gap-1.5">
          <LocaleSwitch locale={locale} />
          <NotificationBell initialUnread={unreadNotifications ?? 0} templates={t.notif} locale={locale} labels={bellLabels} />
        </div>
      </header>

      {/* Phones: slim slate bar */}
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-ardoise px-3 py-2 text-chalk md:hidden">
        <Link href={isPlatformAdmin ? "/platform" : "/dashboard"} className="flex min-w-0 items-center gap-2.5">
          <LogoMark size={32} />
          <span className="truncate text-[15px] font-semibold">{institution?.name ?? (isPlatformAdmin ? t.master.subtitle : "Ardoise")}</span>
        </Link>
        <div className="ml-auto flex items-center">
          <CommandPalette labels={paletteLabels} compact />
          <NotificationBell
            initialUnread={unreadNotifications ?? 0}
            templates={t.notif}
            locale={locale}
            labels={bellLabels}
            tone="dark"
          />
          <LocaleSwitch locale={locale} dark />
          <Link href="/security" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label={t.security.link}>
            <KeyRound size={18} aria-hidden />
          </Link>
          <form action={signOut}>
            <button type="submit" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label={t.common.signOut}>
              <LogOut size={18} aria-hidden />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>
      <TabBar items={items.slice(0, 4)} />
    </div>
  );
}
