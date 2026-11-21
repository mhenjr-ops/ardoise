import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatScore } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Disclosure, Empty, Flash, Textarea } from "@/components/ui";
import { saveSyllabus } from "./actions";

export default async function SyllabusPage({ params, searchParams }: PageProps<"/courses/[courseId]/syllabus">) {
  const { courseId } = await params;
  const sp = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const [{ data: row }, { data: items }] = await Promise.all([
    supabase.from("courses").select("syllabus").eq("id", course.id).maybeSingle(),
    supabase
      .from("assignments")
      .select("id, title, due_at, points_possible, component, weight")
      .eq("course_id", course.id)
      .eq("published", true)
      .not("due_at", "is", null)
      .order("due_at"),
  ]);
  const syllabus = (row?.syllabus as string | undefined) ?? "";

  return (
    <div className="space-y-5">
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} ok={sp.ok ? t.common.saved : null} />
      <Card>
        <CardHeader title={t.syllabus.title} />
        <div className="px-6 py-5">
          {syllabus.trim() ? (
            <div className="prose-lite text-[16px] text-slate-800">{syllabus}</div>
          ) : (
            <p className="text-[15px] text-slate-500">{course.description || t.syllabus.empty}</p>
          )}
        </div>
      </Card>

      {isStaff ? (
        <Disclosure summary={t.syllabus.edit}>
          <form action={saveSyllabus} className="space-y-3">
            <input type="hidden" name="course_id" value={course.id} />
            <Textarea name="syllabus" defaultValue={syllabus} rows={14} placeholder={t.syllabus.placeholder} />
            <Button type="submit">{t.common.save}</Button>
          </form>
        </Disclosure>
      ) : null}

      <Card>
        <CardHeader title={t.syllabus.schedule} icon={<CalendarClock size={17} aria-hidden />} />
        {(items ?? []).length === 0 ? (
          <div className="p-5">
            <Empty>{t.syllabus.noSchedule}</Empty>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(items ?? []).map((a) => (
              <li key={a.id}>
                <Link href={`/courses/${course.id}/assignments/${a.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="num w-40 shrink-0 text-[13.5px] font-semibold text-slate-500">{formatDateTime(locale, a.due_at)}</span>
                  <span className="min-w-0 flex-1 text-[15px] font-semibold">{a.title}</span>
                  <Badge tone={a.component === "exam" ? "danger" : a.component === "tp" ? "info" : "brand"}>
                    {t.assignments.components[a.component as keyof typeof t.assignments.components]}
                  </Badge>
                  <span className="num text-[13px] text-slate-500">
                    {formatScore(locale, Number(a.points_possible))} pts × {formatScore(locale, Number(a.weight))}
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
