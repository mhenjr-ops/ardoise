import Link from "next/link";
import { redirect } from "next/navigation";
import { Library } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Button, Card, CardHeader, Empty, Field, Flash, Input } from "@/components/ui";
import { createBank } from "./actions";

export default async function QuizBanksPage({ params, searchParams }: PageProps<"/courses/[courseId]/quizzes">) {
  const { courseId } = await params;
  const { error } = await searchParams;
  const [{ supabase, course, isStaff }, { t }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}/assignments`);

  const [{ data: banks }, { data: questions }] = await Promise.all([
    supabase.from("question_banks").select("id, title, created_at").eq("course_id", course.id).order("created_at"),
    supabase.from("questions").select("bank_id").eq("course_id", course.id),
  ]);
  const counts = new Map<string, number>();
  for (const q of (questions ?? []) as Array<{ bank_id: string }>) counts.set(q.bank_id, (counts.get(q.bank_id) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} />
      <Card>
        <CardHeader title={t.quiz.banks} />
        {(banks ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t.quiz.noBanks}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {((banks ?? []) as Array<{ id: string; title: string }>).map((b) => (
              <li key={b.id}>
                <Link href={`/courses/${course.id}/quizzes/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Library size={18} className="text-brand-600" aria-hidden />
                  <span className="flex-1 text-sm font-medium text-slate-900">{b.title}</span>
                  <span className="text-xs text-slate-500">
                    {counts.get(b.id) ?? 0} {t.quiz.questions}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form action={createBank} className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-end">
          <input type="hidden" name="course_id" value={course.id} />
          <div className="flex-1">
            <Field label={t.quiz.bankTitle}>
              <Input name="title" required placeholder="Chapitre 1 — Variables et boucles" />
            </Field>
          </div>
          <Button type="submit">{t.quiz.newBank}</Button>
        </form>
      </Card>
      {(banks ?? []).length > 0 ? (
        <Empty>
          <Link href={`/courses/${course.id}/assignments`} className="font-medium text-brand-700 hover:underline">
            {t.quiz.newQuiz} →
          </Link>
        </Empty>
      ) : null}
    </div>
  );
}
