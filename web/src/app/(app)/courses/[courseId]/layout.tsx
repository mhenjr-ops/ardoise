import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { NavLink } from "@/components/nav-link";
import { Badge } from "@/components/ui";

export default async function CourseLayout({ children, params }: LayoutProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const [{ course, isStaff }, { t }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const base = `/courses/${course.id}`;

  return (
    <div>
      <div
        className="mb-6 overflow-hidden rounded-xl text-white shadow-sm"
        style={{ backgroundColor: course.color }}
      >
        <div className="bg-gradient-to-r from-black/30 to-transparent px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
            <span>{course.code}</span>
            {course.level ? <span>· {course.level}</span> : null}
            {!course.published ? <Badge tone="warn">{t.common.unpublished}</Badge> : null}
          </div>
          <h1 className="mt-1 text-xl font-semibold md:text-2xl">{course.title}</h1>
        </div>
      </div>

      <div className="md:flex md:gap-8">
        <nav
          aria-label={course.title}
          className="-mx-4 mb-6 flex overflow-x-auto border-b border-slate-200 px-4 md:mx-0 md:mb-0 md:w-48 md:shrink-0 md:flex-col md:self-start md:border-b-0 md:px-0"
        >
          <NavLink href={base} exact>
            {t.course.home}
          </NavLink>
          <NavLink href={`${base}/announcements`}>{t.course.announcements}</NavLink>
          <NavLink href={`${base}/modules`}>{t.course.modules}</NavLink>
          <NavLink href={`${base}/assignments`}>{t.course.assignments}</NavLink>
          <NavLink href={`${base}/grades`}>{t.course.grades}</NavLink>
          {isStaff ? <NavLink href={`${base}/quizzes`}>{t.quiz.tab}</NavLink> : null}
          {isStaff ? <NavLink href={`${base}/people`}>{t.course.people}</NavLink> : null}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
