import Link from "next/link";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatScore, isPast } from "@/lib/format";
import { Badge, Button, Card, Disclosure, Empty, Field, Flash, Select } from "@/components/ui";
import type { Assignment } from "@/lib/types";
import { createAssignment } from "./actions";
import { AssignmentFields } from "./assignment-fields";
import { QuizSettingsFields } from "./quiz-settings-fields";
import { createQuiz } from "../quizzes/actions";

export default async function AssignmentsPage({ params, searchParams }: PageProps<"/courses/[courseId]/assignments">) {
  const { courseId } = await params;
  const { error } = await searchParams;
  const [{ supabase, course, isStaff, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const { data } = await supabase
    .from("assignments")
    .select("id, course_id, title, description, due_at, points_possible, submission_types, component, weight, published, created_at")
    .eq("course_id", course.id)
    .order("due_at", { ascending: true, nullsFirst: false });
  const assignments = (data ?? []) as Assignment[];
  const ids = assignments.map((a) => a.id);

  const [{ data: subs }, { data: grades }, { data: modules }, { count: studentCount }, { data: attempts }, { data: banks }] = await Promise.all([
    ids.length
      ? supabase.from("submissions").select("assignment_id, student_id").in("assignment_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("grades").select("assignment_id, student_id, score").in("assignment_id", ids)
      : Promise.resolve({ data: [] }),
    isStaff
      ? supabase.from("modules").select("id, title").eq("course_id", course.id).order("position")
      : Promise.resolve({ data: [] }),
    isStaff
      ? supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("course_id", course.id).eq("role", "student")
      : Promise.resolve({ count: 0 }),
    ids.length
      ? supabase.from("quiz_attempts").select("assignment_id, student_id").in("assignment_id", ids).not("submitted_at", "is", null)
      : Promise.resolve({ data: [] }),
    isStaff
      ? supabase.from("question_banks").select("id, title").eq("course_id", course.id).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const { data: rubricRows } = isStaff
    ? await supabase.from("rubrics").select("id, title").eq("course_id", course.id).order("title")
    : { data: [] };
  const rubricList = (rubricRows ?? []) as Array<{ id: string; title: string }>;
  // A submitted quiz attempt counts as a submission.
  const submissionRows = [
    ...((subs ?? []) as Array<{ assignment_id: string; student_id: string }>),
    ...((attempts ?? []) as Array<{ assignment_id: string; student_id: string }>),
  ].filter((row, i, all) => all.findIndex((x) => x.assignment_id === row.assignment_id && x.student_id === row.student_id) === i);
  const bankList = (banks ?? []) as Array<{ id: string; title: string }>;
  const moduleList = (modules ?? []) as Array<{ id: string; title: string }>;
  const gradeRows = (grades ?? []) as Array<{ assignment_id: string; student_id: string; score: number | null }>;

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} />

      {isStaff ? (
        <Disclosure summary={t.assignments.newAssignment}>
          <form action={createAssignment} className="space-y-4">
            <input type="hidden" name="course_id" value={course.id} />
            <AssignmentFields t={t} rubrics={rubricList} />
            {(modules ?? []).length ? (
              <Field label={`${t.course.modules} (${t.common.optional})`}>
                <Select name="module_id" defaultValue="">
                  <option value="">—</option>
                  {((modules ?? []) as Array<{ id: string; title: string }>).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Button type="submit">{t.common.create}</Button>
          </form>
        </Disclosure>
      ) : null}

      {isStaff ? (
        <Disclosure summary={t.quiz.newQuiz}>
          {bankList.length === 0 ? (
            <p className="text-sm text-slate-600">
              {t.quiz.noBanks}{" "}
              <a href={`/courses/${course.id}/quizzes`} className="font-medium text-brand-700 hover:underline">
                {t.quiz.banks}
              </a>
            </p>
          ) : (
            <form action={createQuiz} className="space-y-4">
              <input type="hidden" name="course_id" value={course.id} />
              <AssignmentFields t={t} quiz />
              <Field label={t.quiz.bank}>
                <Select name="bank_id" required>
                  {bankList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <QuizSettingsFields t={t} />
              {moduleList.length ? (
                <Field label={`${t.course.modules} (${t.common.optional})`}>
                  <Select name="module_id" defaultValue="">
                    <option value="">—</option>
                    {moduleList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Button type="submit">{t.quiz.newQuiz}</Button>
            </form>
          )}
        </Disclosure>
      ) : null}

      {assignments.length === 0 ? (
        <Empty>{t.assignments.none}</Empty>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {assignments.map((a) => {
              const submitted = submissionRows.filter((s) => s.assignment_id === a.id);
              const myGrade = gradeRows.find((g) => g.assignment_id === a.id && g.student_id === user.id);
              const gradedCount = gradeRows.filter((g) => g.assignment_id === a.id && g.score !== null).length;
              const mine = submitted.some((s) => s.student_id === user.id);
              return (
                <li key={a.id}>
                  <Link
                    href={`/courses/${course.id}/assignments/${a.id}`}
                    className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{a.title}</span>
                        <Badge tone="brand">{t.assignments.components[a.component]}</Badge>
                        {a.submission_types.includes("quiz") ? <Badge tone="info">{t.quiz.tab}</Badge> : null}
                        {isStaff && !a.published ? <Badge tone="warn">{t.common.unpublished}</Badge> : null}
                      </div>
                      <p className={`mt-0.5 text-xs ${isPast(a.due_at) ? "text-slate-500" : "text-slate-600"}`}>
                        {a.due_at ? `${t.common.due} ${formatDateTime(locale, a.due_at)}` : t.common.noDue} ·{" "}
                        {formatScore(locale, a.points_possible)} {t.common.points} · ×{formatScore(locale, a.weight)}
                      </p>
                    </div>
                    <div className="text-sm">
                      {isStaff ? (
                        <span className="text-slate-600">
                          {submitted.length}/{studentCount ?? 0} {t.assignments.submissions} · {gradedCount}{" "}
                          {t.assignments.graded}
                        </span>
                      ) : myGrade && myGrade.score !== null ? (
                        <Badge tone="brand">
                          {formatScore(locale, myGrade.score)} / {formatScore(locale, a.points_possible)}
                        </Badge>
                      ) : mine ? (
                        <Badge tone="info">{t.assignments.submitted}</Badge>
                      ) : isPast(a.due_at) ? (
                        <Badge tone="danger">{t.assignments.late}</Badge>
                      ) : (
                        <Badge>{t.assignments.notSubmitted}</Badge>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
