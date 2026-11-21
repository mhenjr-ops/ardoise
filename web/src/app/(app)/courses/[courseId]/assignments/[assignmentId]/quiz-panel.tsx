import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";
import type { Locale, Messages } from "@/lib/i18n/messages";
import { formatDateTime, formatScore } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Disclosure } from "@/components/ui";
import type { Assignment, Quiz, QuizAttempt } from "@/lib/types";
import { startQuiz, updateQuiz } from "../../quizzes/actions";
import { QuizSettingsFields } from "../quiz-settings-fields";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type AttemptRow = QuizAttempt & {
  student: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export async function QuizPanel({
  supabase,
  courseId,
  assignment,
  quiz,
  isStaff,
  isStudent,
  userId,
  t,
  locale,
}: {
  supabase: Supabase;
  courseId: string;
  assignment: Assignment;
  quiz: Quiz;
  isStaff: boolean;
  isStudent: boolean;
  userId: string;
  t: Messages;
  locale: Locale;
}) {
  const { data } = await supabase
    .from("quiz_attempts")
    .select(
      "id, quiz_id, assignment_id, student_id, attempt_no, question_ids, option_orders, answers, started_at, deadline_at, submitted_at, score, max_score, needs_review, student:profiles(full_name, email)",
    )
    .eq("quiz_id", quiz.id)
    .order("started_at", { ascending: false });
  const attempts = (data ?? []) as AttemptRow[];
  const base = `/courses/${courseId}/assignments/${assignment.id}`;
  const scaled = (a: QuizAttempt) =>
    a.score === null || !Number(a.max_score) ? null : (Number(a.score) / Number(a.max_score)) * Number(assignment.points_possible);

  const summary = (
    <dl className="grid gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-4">
      <div>
        <dt className="text-[12.5px] font-semibold text-slate-500">{t.quiz.timeLimit.split("(")[0]}</dt>
        <dd>{quiz.time_limit_minutes ? `${quiz.time_limit_minutes} ${t.quiz.minutes}` : t.quiz.unlimited}</dd>
      </div>
      <div>
        <dt className="text-[12.5px] font-semibold text-slate-500">{t.quiz.attempts}</dt>
        <dd>{quiz.attempts_allowed}</dd>
      </div>
      <div>
        <dt className="text-[12.5px] font-semibold text-slate-500">{t.quiz.questions}</dt>
        <dd>{quiz.question_count ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-[12.5px] font-semibold text-slate-500">{t.quiz.showResults}</dt>
        <dd>{t.quiz.showResultsOptions[quiz.show_results]}</dd>
      </div>
    </dl>
  );

  if (isStudent) {
    const mine = attempts.filter((a) => a.student_id === userId);
    const open = mine.find((a) => !a.submitted_at && (!a.deadline_at || new Date(a.deadline_at) > new Date()));
    const used = mine.length;
    const canStart = !!open || used < quiz.attempts_allowed;
    return (
      <Card>
        <CardHeader title={t.quiz.settings} />
        <div className="space-y-5 px-5 py-4">
          {summary}
          <p className="text-sm text-slate-600">
            {used} {t.quiz.attemptsUsed} {quiz.attempts_allowed}
          </p>
          {canStart ? (
            <form action={startQuiz}>
              <input type="hidden" name="course_id" value={courseId} />
              <input type="hidden" name="assignment_id" value={assignment.id} />
              <input type="hidden" name="quiz_id" value={quiz.id} />
              <Button type="submit">
                <PlayCircle size={18} aria-hidden />
                {open ? t.quiz.resume : t.quiz.start}
              </Button>
            </form>
          ) : (
            <Badge tone="warn">{t.quiz.noAttemptsLeft}</Badge>
          )}
          {mine.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {mine.map((a) => (
                <li key={a.id}>
                  <Link href={`${base}/attempts/${a.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                    <span className="font-medium">
                      {t.quiz.attempt} {a.attempt_no}
                    </span>
                    <span className="flex-1 text-xs text-slate-500">{formatDateTime(locale, a.submitted_at ?? a.started_at)}</span>
                    {!a.submitted_at ? (
                      <Badge tone="info">{t.quiz.inProgress}</Badge>
                    ) : a.needs_review ? (
                      <Badge tone="warn">{t.quiz.pendingReview}</Badge>
                    ) : (
                      <Badge tone="brand">
                        {formatScore(locale, scaled(a))} / {formatScore(locale, assignment.points_possible)}
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    );
  }

  if (!isStaff) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t.quiz.settings} />
        <div className="px-5 py-4">{summary}</div>
      </Card>
      <Disclosure summary={`${t.common.edit} · ${t.quiz.settings}`}>
        <form action={updateQuiz} className="space-y-4">
          <input type="hidden" name="course_id" value={courseId} />
          <input type="hidden" name="assignment_id" value={assignment.id} />
          <input type="hidden" name="quiz_id" value={quiz.id} />
          <QuizSettingsFields t={t} quiz={quiz} />
          <Button type="submit">{t.common.save}</Button>
        </form>
      </Disclosure>
      <Card className="overflow-hidden">
        <CardHeader title={`${t.quiz.students} (${attempts.length})`} />
        {attempts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t.quiz.none}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attempts.map((a) => {
              const p = Array.isArray(a.student) ? a.student[0] : a.student;
              return (
                <li key={a.id}>
                  <Link href={`${base}/attempts/${a.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{p?.full_name || p?.email}</span>
                    <span className="text-xs text-slate-500">
                      {t.quiz.attempt} {a.attempt_no}
                    </span>
                    {!a.submitted_at ? (
                      <Badge tone="info">{t.quiz.inProgress}</Badge>
                    ) : (
                      <>
                        {a.needs_review ? <Badge tone="warn">{t.quiz.needsReview}</Badge> : null}
                        <Badge tone="brand">
                          {formatScore(locale, a.score)} / {formatScore(locale, a.max_score)}
                        </Badge>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
