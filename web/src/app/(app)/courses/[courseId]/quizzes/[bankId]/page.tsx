import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatScore } from "@/lib/format";
import { Badge, Card, Disclosure, Empty, Flash } from "@/components/ui";
import type { Question } from "@/lib/types";
import { deleteBank, deleteQuestion } from "../actions";
import { QuestionForm } from "./question-form";
import { describeKey } from "./describe-key";

export default async function BankPage({ params, searchParams }: PageProps<"/courses/[courseId]/quizzes/[bankId]">) {
  const { courseId, bankId } = await params;
  const { error, ok } = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}`);

  const { data: bank } = await supabase.from("question_banks").select("id, title").eq("id", bankId).eq("course_id", course.id).maybeSingle();
  if (!bank) notFound();

  const { data: qData } = await supabase
    .from("questions")
    .select("id, bank_id, qtype, prompt, options, points, position")
    .eq("bank_id", bank.id)
    .order("position");
  const questions = (qData ?? []) as Question[];
  const { data: keys } = questions.length
    ? await supabase
        .from("question_keys")
        .select("question_id, correct, explanation")
        .in(
          "question_id",
          questions.map((q) => q.id),
        )
    : { data: [] };
  const keyMap = new Map(((keys ?? []) as Array<{ question_id: string; correct: unknown }>).map((k) => [k.question_id, k.correct]));
  const total = questions.reduce((s, q) => s + Number(q.points), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/courses/${course.id}/quizzes`} className="text-sm text-brand-700 hover:underline">
            ← {t.quiz.banks}
          </Link>
          <h2 className="text-lg font-semibold text-slate-900">{bank.title}</h2>
          <p className="text-xs text-slate-500">
            {questions.length} {t.quiz.questions} · {formatScore(locale, total)} {t.common.points}
          </p>
        </div>
        <form action={deleteBank}>
          <input type="hidden" name="course_id" value={course.id} />
          <input type="hidden" name="bank_id" value={bank.id} />
          <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
            {t.quiz.deleteBank}
          </button>
        </form>
      </div>
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />

      <Disclosure summary={t.quiz.addQuestion} open={questions.length === 0}>
        <QuestionForm
          courseId={course.id}
          bankId={bank.id}
          labels={{
            addQuestion: t.quiz.addQuestion,
            type: t.quiz.type,
            types: t.quiz.types,
            prompt: t.quiz.prompt,
            points: t.quiz.points,
            options: t.quiz.options,
            addOption: t.quiz.addOption,
            acceptedAnswers: t.quiz.acceptedAnswers,
            value: t.quiz.value,
            tolerance: t.quiz.tolerance,
            explanation: t.quiz.explanation,
            essayNote: t.quiz.essayNote,
            trueLabel: t.quiz.trueLabel,
            falseLabel: t.quiz.falseLabel,
            remove: t.modules.remove,
          }}
        />
      </Disclosure>

      {questions.length === 0 ? (
        <Empty>{t.quiz.noQuestions}</Empty>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} id={`q-${q.id}`}>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">#{i + 1}</span>
                      <Badge tone="brand">{t.quiz.types[q.qtype]}</Badge>
                      <Badge>
                        {formatScore(locale, q.points)} {t.common.points}
                      </Badge>
                    </div>
                    <p className="prose-lite text-sm text-slate-900">{q.prompt}</p>
                    {q.options.length ? (
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {q.options.map((o) => (
                          <li key={o.id}>
                            <span className="font-semibold">{o.id.toUpperCase()}.</span> {o.text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-xs text-brand-700">✓ {describeKey(q, keyMap.get(q.id), t, locale)}</p>
                  </div>
                  <form action={deleteQuestion}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="bank_id" value={bank.id} />
                    <input type="hidden" name="id" value={q.id} />
                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                      {t.common.delete}
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
