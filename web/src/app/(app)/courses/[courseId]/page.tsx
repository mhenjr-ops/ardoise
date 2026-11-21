import Link from "next/link";
import { getCourseContext } from "@/lib/session";
import { getI18n } from "@/lib/i18n/server";
import { daysFromNowIso, formatDateTime, isPast } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";
import type { Announcement, Assignment } from "@/lib/types";
import { updateDescription } from "./actions";

export default async function CourseHomePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const [{ data: announcements }, { data: upcoming }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, course_id, title, body, author_id, created_at")
      .eq("course_id", course.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("assignments")
      .select("id, course_id, title, due_at, points_possible, component")
      .eq("course_id", course.id)
      .gte("due_at", daysFromNowIso(0))
      .order("due_at", { ascending: true })
      .limit(5),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title={t.course.about} />
          <div className="px-5 py-4">
            {isStaff ? (
              <form action={updateDescription} className="space-y-3">
                <input type="hidden" name="course_id" value={course.id} />
                <textarea
                  name="description"
                  defaultValue={course.description}
                  rows={5}
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-brand-600 focus:outline-none"
                />
                <button type="submit" className="text-sm font-medium text-brand-700 hover:underline">
                  {t.common.save}
                </button>
              </form>
            ) : (
              <p className="prose-lite text-sm text-slate-700">{course.description || "—"}</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t.course.recentAnnouncements}
            action={
              <Link href={`/courses/${course.id}/announcements`} className="text-sm text-brand-700 hover:underline">
                {t.common.view}
              </Link>
            }
          />
          {(announcements ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t.course.noAnnouncements}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {((announcements ?? []) as Announcement[]).map((a) => (
                <li key={a.id} className="px-5 py-4">
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(locale, a.created_at)}</p>
                  <p className="prose-lite mt-2 line-clamp-3 text-sm text-slate-700">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="self-start">
        <CardHeader title={t.course.upcoming} />
        {(upcoming ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t.dashboard.nothingDue}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {((upcoming ?? []) as Assignment[]).map((a) => (
              <li key={a.id}>
                <Link href={`/courses/${course.id}/assignments/${a.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <span className="block text-sm font-medium text-slate-900">{a.title}</span>
                  <span className={`text-xs ${isPast(a.due_at) ? "text-red-600" : "text-slate-500"}`}>
                    {formatDateTime(locale, a.due_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
