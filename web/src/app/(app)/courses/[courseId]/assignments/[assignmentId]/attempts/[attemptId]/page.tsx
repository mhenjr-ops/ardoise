import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatScore, nowIso } from "@/lib/format";
import { Badge, Button, Card, Flash, Input } from "@/components/ui";
import type { AttemptReview, QuizAttempt } from "@/lib/types";
import { gradeQuestion } from "../../../../quizzes/actions";
import { describeAnswer, describeKey } from "../../../../quizzes/[bankId]/describe-key";
import { QuizRunner } from "./quiz-runner";

type AttemptRow = QuizAttempt & { student: { full_name: string; email: string } | { full_name: string; email: string }[] | null };

export default async function AttemptPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]/assignments/[assignmentId]/attempts/[attemptId]">) {
  const { courseId, assignmentId, attemptId } = await params;
  const query = await searchParams;
  const [{ supabase, course, isStaff, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const loadAttempt = async () =>
    (
      await supabase
        .from("quiz_attempts")
        .select(
          "id, quiz_id, assignment_id, student_id, attempt_no, question_ids, option_orders, answers, started_at, deadline_at, submitted_at, score, max_score, needs_review, student:profiles(full_name, email)",
        )
        .eq("id", attemptId)
        .eq("assignment_id", assignmentId)
        .maybeSingle()
    ).data as AttemptRow | null;

  let attempt = await loadAttempt();
  if (!attempt) notFound();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, points_possible")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();

  const isOwner = attempt.student_id === user.id;
  const expired = attempt.deadline_at ? new Date(attempt.deadline_at).getTime() + 30_000 < new Date(nowIso()).getTime() : false;

  // An attempt whose time ran out while the student was away is closed on their next visit.
  if (isOwner && !attempt.submitted_at && expired) {
    await supabase.rpc("submit_quiz_attempt", { p_attempt: attempt.id, p_answers: null });
    attempt = (await loadAttempt()) ?? attempt;
  }

  const { data: reviewData, error: reviewError } = await supabase.rpc("quiz_attempt_review", { p_attempt: attempt.id });
  if (reviewError || !reviewData) notFound();
  const review = reviewData as AttemptReview;
  const backHref = `/courses/${course.id}/assignments/${assignmentId}`;

  if (isOwner && !attempt.submitted_at) {
    const orders = attempt.option_orders ?? {};
    const questions = review.questions.map((q) => {
      const order = orders[q.id];
      const options = order ? order.map((id) => q.options.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o) : q.options;
      return { id: q.id, qtype: q.qtype, prompt: q.prompt, options, points: Number(q.points) };
    });
    return (
      <div>
        <Link href={backHref} className="text-sm text-brand-700 hover:underline">
          ← {assignment.title}
        </Link>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {assignment.title} · {t.quiz.attempt} {attempt.attempt_no}
        </h2>
        <QuizRunner
          attemptId={attempt.id}
          questions={questions}
          initialAnswers={attempt.answers ?? {}}
          deadline={attempt.deadline_at}
          serverNow={nowIso()}
          labels={{
            timeLeft: t.quiz.timeLeft,
            saved: t.quiz.saved,
            saving: t.quiz.saving,
            offline: t.quiz.offline,
            submit: t.quiz.submit,
            confirmSubmit: t.quiz.confirmSubmit,
            answered: t.quiz.answered,
            trueLabel: t.quiz.trueLabel,
            falseLabel: t.quiz.falseLabel,
            points: t.common.points,
            timeUp: t.quiz.timeUp,
            error: t.errors.generic,
            cancel: t.common.cancel,
          }}
        />
      </div>
    );
  }

  const student = Array.isArray(attempt.student) ? attempt.student[0] : attempt.student;
  const scaled =
    review.score === null || !Number(review.max_score)
      ? null
      : (Number(review.score) / Number(review.max_score)) * Number(assignment.points_possible);

  return (
    <div className="space-y-4">
      <div>
        <Link href={backHref} className="text-sm text-brand-700 hover:underline">
          ← {assignment.title}
        </Link>
        <h2 className="text-lg font-semibold text-slate-900">
          {t.quiz.review} · {t.quiz.attempt} {attempt.attempt_no}
        </h2>
        {isStaff ? <p className="text-sm text-slate-500">{student?.full_name || student?.email}</p> : null}
      </div>
      <Flash
        error={errorText(t, typeof query.error === "string" ? query.error : null)}
        ok={query.ok ? t.common.saved : null}
      />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-slate-500">{t.quiz.score}</p>
          <p className="text-2xl font-semibold text-slate-900">
            {formatScore(locale, review.score)} / {formatScore(locale, review.max_score)}
            <span className="ml-2 text-base font-normal text-slate-500">
              → {formatScore(locale, scaled)} / {formatScore(locale, assignment.points_possible)}
            </span>
          </p>
          <p className="text-xs text-slate-500">{formatDateTime(locale, attempt.submitted_at)}</p>
        </div>
        {review.needs_review ? <Badge tone="warn">{t.quiz.pendingReview}</Badge> : null}
      </Card>

      {!review.show_keys ? <p className="text-sm text-slate-500">{t.quiz.keysHidden}</p> : null}

      <ol className="space-y-3">
        {review.questions.map((q, i) => {
          const answer = describeAnswer(q, q.answer, t);
          const earned = q.earned === null || q.earned === undefined ? null : Number(q.earned);
          const full = earned !== null && earned >= Number(q.points);
          return (
            <li key={q.id} id={`q-${q.id}`}>
              <Card className="p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="prose-lite text-sm font-medium text-slate-900">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>
                    {q.prompt}
                  </p>
                  <Badge tone={earned === null ? "warn" : full ? "brand" : earned > 0 ? "info" : "danger"}>
                    {earned === null ? "?" : formatScore(locale, earned)} / {formatScore(locale, q.points)}
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="text-slate-500">{t.quiz.yourAnswer} : </span>
                  {answer ? <span className="prose-lite text-slate-900">{answer}</span> : <em className="text-slate-400">{t.quiz.noAnswer}</em>}
                </p>
                {review.show_keys && q.qtype !== "essay" ? (
                  <p className="mt-1 text-sm text-brand-700">
                    {t.quiz.expected} : {describeKey(q, q.correct, t, locale)}
                  </p>
                ) : null}
                {review.show_keys && q.explanation ? <p className="mt-1 text-sm text-slate-600">{q.explanation}</p> : null}

                {isStaff ? (
                  <form action={gradeQuestion} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="assignment_id" value={assignmentId} />
                    <input type="hidden" name="attempt_id" value={attempt.id} />
                    <input type="hidden" name="question_id" value={q.id} />
                    <label className="text-xs text-slate-500">
                      {t.quiz.gradeQuestion} (/{formatScore(locale, q.points)})
                      <Input
                        name="points"
                        inputMode="decimal"
                        defaultValue={q.manual && earned !== null ? String(earned) : ""}
                        placeholder={earned !== null ? String(earned) : ""}
                        className="mt-1 w-28"
                      />
                    </label>
                    <Button type="submit" size="sm" variant="secondary">
                      {t.common.save}
                    </Button>
                  </form>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
