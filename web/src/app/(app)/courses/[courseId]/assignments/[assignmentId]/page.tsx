import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, PenLine } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatScore, isPast } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Disclosure, Flash, buttonClass } from "@/components/ui";
import type { Assignment, Grade, Quiz, Submission } from "@/lib/types";
import { QuizPanel } from "./quiz-panel";
import { SubmitForm } from "./submit-form";
import { updateAssignment } from "./actions";
import { AssignmentFields } from "../assignment-fields";

export default async function AssignmentPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]/assignments/[assignmentId]">) {
  const { courseId, assignmentId } = await params;
  const { error, ok } = await searchParams;
  const [{ supabase, course, isStaff, courseRole, user }, { t, locale }] = await Promise.all([
    getCourseContext(courseId),
    getI18n(),
  ]);

  const { data } = await supabase
    .from("assignments")
    .select("id, course_id, title, description, due_at, points_possible, submission_types, component, weight, published, created_at")
    .eq("id", assignmentId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!data) notFound();
  const assignment = data as Assignment;

  const isStudent = courseRole === "student";
  const isQuiz = assignment.submission_types.includes("quiz");
  const { data: quizData } = isQuiz
    ? await supabase
        .from("quizzes")
        .select("id, assignment_id, bank_id, question_count, time_limit_minutes, attempts_allowed, shuffle_questions, shuffle_options, show_results")
        .eq("assignment_id", assignment.id)
        .maybeSingle()
    : { data: null };
  const quiz = quizData as Quiz | null;
  const [{ data: subData }, { data: gradeData }, staffStats] = await Promise.all([
    isStudent
      ? supabase
          .from("submissions")
          .select("id, assignment_id, student_id, body, file_path, file_name, submitted_at")
          .eq("assignment_id", assignment.id)
          .eq("student_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isStudent
      ? supabase
          .from("grades")
          .select("id, assignment_id, student_id, score, comment, graded_at")
          .eq("assignment_id", assignment.id)
          .eq("student_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isStaff
      ? Promise.all([
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("assignment_id", assignment.id),
          supabase
            .from("grades")
            .select("id", { count: "exact", head: true })
            .eq("assignment_id", assignment.id)
            .not("score", "is", null),
          supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("course_id", course.id)
            .eq("role", "student"),
        ])
      : Promise.resolve(null),
  ]);
  const submission = subData as Submission | null;
  const grade = gradeData as Grade | null;

  let fileUrl: string | null = null;
  if (submission?.file_path) {
    const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(submission.file_path, 60 * 30);
    fileUrl = signed?.signedUrl ?? null;
  }

  const late = isPast(assignment.due_at);

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{assignment.title}</h2>
          <Badge tone="brand">{t.assignments.components[assignment.component]}</Badge>
          {!assignment.published ? <Badge tone="warn">{t.common.unpublished}</Badge> : null}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">{t.assignments.dueAt}</dt>
            <dd className={late ? "text-red-600" : ""}>{assignment.due_at ? formatDateTime(locale, assignment.due_at) : t.common.noDue}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">{t.assignments.pointsPossible}</dt>
            <dd>
              {formatScore(locale, assignment.points_possible)} {t.common.points}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">{t.assignments.weight}</dt>
            <dd>×{formatScore(locale, assignment.weight)}</dd>
          </div>
        </dl>
        {assignment.description ? (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">{t.assignments.instructions}</h3>
            <p className="prose-lite text-sm text-slate-800">{assignment.description}</p>
          </div>
        ) : null}
      </Card>

      {quiz ? (
        <QuizPanel
          supabase={supabase}
          courseId={course.id}
          assignment={assignment}
          quiz={quiz}
          isStaff={isStaff}
          isStudent={isStudent}
          userId={user.id}
          t={t}
          locale={locale}
        />
      ) : null}

      {isStaff && staffStats && !isQuiz ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-slate-700">
            {staffStats[0].count ?? 0}/{staffStats[2].count ?? 0} {t.assignments.submissions} · {staffStats[1].count ?? 0}{" "}
            {t.assignments.graded}
          </p>
          <Link href={`/courses/${course.id}/assignments/${assignment.id}/grade`} className={buttonClass("primary")}>
            <PenLine size={16} aria-hidden />
            {t.assignments.gradeSubmissions}
          </Link>
        </Card>
      ) : null}

      {isStudent ? (
        <>
          {grade && grade.score !== null ? (
            <Card className="border-brand-200 bg-brand-50 p-5">
              <p className="text-sm font-medium text-brand-800">{t.assignments.yourGrade}</p>
              <p className="mt-1 text-3xl font-semibold text-brand-800">
                {formatScore(locale, grade.score)}
                <span className="text-base font-normal text-brand-700"> / {formatScore(locale, assignment.points_possible)}</span>
              </p>
              {grade.comment ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t.assignments.feedback}</p>
                  <p className="prose-lite mt-1 text-sm text-slate-800">{grade.comment}</p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {isQuiz ? null : (
          <Card>
            <CardHeader
              title={t.assignments.yourSubmission}
              action={
                submission ? (
                  <span className="text-xs text-slate-500">
                    {t.assignments.submittedAt} {formatDateTime(locale, submission.submitted_at)}
                  </span>
                ) : (
                  <Badge tone={late ? "danger" : "neutral"}>{late ? t.assignments.late : t.assignments.notSubmitted}</Badge>
                )
              }
            />
            <div className="space-y-4 px-5 py-4">
              {submission?.file_path ? (
                fileUrl ? (
                  <a href={fileUrl} className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                    <Download size={16} aria-hidden />
                    {submission.file_name ?? t.assignments.downloadFile}
                  </a>
                ) : (
                  <p className="text-sm text-slate-600">{submission.file_name}</p>
                )
              ) : null}
              <SubmitForm
                courseId={course.id}
                assignmentId={assignment.id}
                userId={user.id}
                allowText={assignment.submission_types.includes("text")}
                allowFile={assignment.submission_types.includes("file")}
                hasSubmission={!!submission}
                defaultBody={submission?.body ?? ""}
                labels={{
                  textAnswer: t.assignments.textAnswer,
                  file: t.assignments.file,
                  submit: t.assignments.submit,
                  resubmit: t.assignments.resubmit,
                  uploading: t.assignments.uploading,
                  fileTooBig: t.assignments.fileTooBig,
                  submitted: t.assignments.submitted,
                  error: t.errors.generic,
                }}
              />
            </div>
          </Card>
          )}
        </>
      ) : null}

      {isStaff ? (
        <Disclosure summary={t.common.edit}>
          <form action={updateAssignment} className="space-y-4">
            <input type="hidden" name="course_id" value={course.id} />
            <input type="hidden" name="id" value={assignment.id} />
            {isQuiz ? <input type="hidden" name="is_quiz" value="1" /> : null}
            <AssignmentFields t={t} assignment={assignment} quiz={isQuiz} />
            <Button type="submit">{t.common.save}</Button>
          </form>
        </Disclosure>
      ) : null}
    </div>
  );
}
