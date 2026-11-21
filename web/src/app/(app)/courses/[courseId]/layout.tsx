import {
  BarChart3,
  BookOpen,
  CalendarCheck2,
  ClipboardList,
  FolderOpen,
  House,
  LayoutList,
  ListChecks,
  Megaphone,
  MessagesSquare,
  NotebookPen,
  Timer,
  Users,
} from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { NDOP_COVER } from "@/lib/ndop";
import { NavLink } from "@/components/nav-link";
import { Badge } from "@/components/ui";

export default async function CourseLayout({ children, params }: LayoutProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const [{ course, isStaff, supabase }, { t }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const base = `/courses/${course.id}`;
  const { data: teachers } = await supabase
    .from("enrollments")
    .select("user:profiles(full_name, email)")
    .eq("course_id", course.id)
    .eq("role", "teacher")
    .limit(3);
  const teacherNames = (teachers ?? [])
    .map((r) => (Array.isArray(r.user) ? r.user[0] : r.user) as { full_name: string; email: string } | null)
    .filter(Boolean)
    .map((u) => u!.full_name || u!.email);

  const nav = [
    { href: base, label: t.course.home, icon: <House size={17} />, exact: true },
    { href: `${base}/syllabus`, label: t.syllabus.title, icon: <BookOpen size={17} /> },
    { href: `${base}/announcements`, label: t.course.announcements, icon: <Megaphone size={17} /> },
    { href: `${base}/modules`, label: t.course.modules, icon: <LayoutList size={17} /> },
    { href: `${base}/assignments`, label: t.course.assignments, icon: <NotebookPen size={17} /> },
    { href: `${base}/discussions`, label: t.discussions.title, icon: <MessagesSquare size={17} /> },
    ...(isStaff ? [{ href: `${base}/quizzes`, label: t.quiz.tab, icon: <Timer size={17} /> }] : []),
    { href: `${base}/grades`, label: t.course.grades, icon: <ClipboardList size={17} /> },
    { href: `${base}/files`, label: t.files.title, icon: <FolderOpen size={17} /> },
    { href: `${base}/attendance`, label: t.attendance.title, icon: <CalendarCheck2 size={17} /> },
    ...(isStaff
      ? [
          { href: `${base}/rubrics`, label: t.rubrics.title, icon: <ListChecks size={17} /> },
          { href: `${base}/people`, label: t.course.people, icon: <Users size={17} /> },
          { href: `${base}/analytics`, label: t.analytics.title, icon: <BarChart3 size={17} /> },
        ]
      : []),
  ];

  return (
    <div>
      <div className="relative mb-6 overflow-hidden rounded-[22px] text-white" style={{ backgroundColor: course.color }}>
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: NDOP_COVER, backgroundSize: "92px 92px" }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/25 to-black/5" />
        <div className="relative px-5 py-6 md:px-7 md:py-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num rounded-md bg-black/25 px-2 py-0.5 text-[13px] font-extrabold tracking-wide backdrop-blur-sm">{course.code}</span>
            {course.level ? <span className="rounded-md bg-white/15 px-2 py-0.5 text-[12.5px] font-bold">{course.level}</span> : null}
            {!course.published ? <Badge tone="warn">{t.common.unpublished}</Badge> : null}
          </div>
          <h1 className="mt-3 max-w-3xl font-display text-[1.9rem] font-semibold leading-tight md:text-[2.4rem]">{course.title}</h1>
          {teacherNames.length ? (
            <p className="mt-2 text-[15px] text-white/80">{teacherNames.join(", ")}</p>
          ) : null}
        </div>
      </div>

      <div className="md:flex md:gap-8">
        <nav
          aria-label={course.title}
          className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 md:sticky md:top-24 md:mx-0 md:mb-0 md:w-52 md:shrink-0 md:flex-col md:self-start md:overflow-visible md:px-0"
        >
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.exact} icon={n.icon}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
