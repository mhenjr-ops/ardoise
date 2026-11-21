import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatScore } from "@/lib/format";
import { Button, Card, Disclosure, Empty, Field, Flash, Input } from "@/components/ui";
import type { Rubric } from "@/lib/types";
import { createRubric, deleteRubric } from "./actions";
import { RubricEditor } from "./rubric-editor";

export default async function RubricsPage({ params, searchParams }: PageProps<"/courses/[courseId]/rubrics">) {
  const { courseId } = await params;
  const sp = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}`);

  const [{ data }, { data: uses }] = await Promise.all([
    supabase.from("rubrics").select("id, course_id, title, criteria").eq("course_id", course.id).order("created_at"),
    supabase.from("assignments").select("rubric_id").eq("course_id", course.id).not("rubric_id", "is", null),
  ]);
  const rubrics = (data ?? []) as Rubric[];
  const assignmentCount = (id: string) => (uses ?? []).filter((u) => u.rubric_id === id).length;

  return (
    <div className="space-y-5">
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} ok={sp.ok ? t.common.saved : null} />
      <Disclosure summary={t.rubrics.newRubric} open={rubrics.length === 0}>
        <form action={createRubric} className="space-y-4">
          <input type="hidden" name="course_id" value={course.id} />
          <Field label={t.rubrics.rubricTitle}>
            <Input name="title" required maxLength={120} placeholder="Grille TP" />
          </Field>
          <RubricEditor
            defaultLevels={t.rubrics.defaultLevels}
            labels={{
              criterion: t.rubrics.criterion,
              addCriterion: t.rubrics.addCriterion,
              level: t.rubrics.level,
              addLevel: t.rubrics.addLevel,
              points: t.rubrics.points,
              total: t.rubrics.total,
            }}
          />
          <Button type="submit">{t.common.create}</Button>
        </form>
      </Disclosure>

      {rubrics.length === 0 ? (
        <Empty>{t.rubrics.empty}</Empty>
      ) : (
        rubrics.map((r) => {
          const max = r.criteria.reduce((s, c) => s + Math.max(0, ...c.levels.map((l) => Number(l.points))), 0);
          return (
            <Card key={r.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h2 className="font-display text-xl font-semibold">{r.title}</h2>
                  <p className="flex flex-wrap gap-x-4 text-[13px] text-slate-500">
                    <span>{fmt(t.rubrics.usedBy, { n: assignmentCount(r.id) })}</span>
                    <span className="num">
                      {t.rubrics.total} {formatScore(locale, max)} {t.rubrics.points}
                    </span>
                  </p>
                </div>
                <form action={deleteRubric}>
                  <input type="hidden" name="course_id" value={course.id} />
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" variant="danger" size="sm">
                    <Trash2 size={14} aria-hidden />
                    {t.rubrics.deleteRubric}
                  </Button>
                </form>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <tbody>
                    {r.criteria.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <th scope="row" className="w-48 bg-slate-50/60 px-5 py-3 text-left align-top">
                          <span className="block font-bold text-slate-900">{c.title}</span>
                          {c.description ? <span className="block text-[12.5px] font-normal text-slate-500">{c.description}</span> : null}
                        </th>
                        {c.levels.map((l) => (
                          <td key={l.id} className="border-l border-slate-100 px-4 py-3 align-top">
                            <span className="block font-semibold text-slate-800">{l.title}</span>
                            <span className="num text-[13px] font-bold text-ochre-700">
                              {formatScore(locale, Number(l.points))} {t.rubrics.points}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
