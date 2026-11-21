import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDateTime, formatScore, isPast } from "@/lib/format";
import { NDOP_INK } from "@/lib/ndop";
import { Avatar, Badge, Button, Card, Empty, Field, Flash, Input, Textarea, cx } from "@/components/ui";
import { RubricScorer } from "@/components/grading/rubric-scorer";
import type { Assignment, Grade, Rubric, RubricRatings, Submission } from "@/lib/types";
import { saveGrade, saveRubricGrade } from "./actions";

type StudentRow = { user_id: string; profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null };

export default async function GraderPage({
  params,
  searchParams,
}: PageProps<"/courses/[courseId]/assignments/[assignmentId]/grade">) {
  const { courseId, assignmentId } = await params;
  const query = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}/assignments/${assignmentId}`);

  const { data } = await supabase
    .from("assignments")
    .select("id, course_id, title, description, due_at, points_possible, submission_types, component, weight, published, created_at, rubric_id")
    .eq("id", assignmentId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!data) notFound();
  const assignment = data as Assignment & { rubric_id: string | null };

  const [{ data: studentData }, { data: subData }, { data: gradeData }, { data: rubricData }] = await Promise.all([
    supabase.from("enrollments").select("user_id, profile:profiles(full_name, email)").eq("course_id", course.id).eq("role", "student"),
    supabase.from("submissions").select("id, assignment_id, student_id, body, file_path, file_name, submitted_at").eq("assignment_id", assignment.id),
    supabase.from("grades").select("id, assignment_id, student_id, score, comment, graded_at").eq("assignment_id", assignment.id),
    assignment.rubric_id
      ? supabase.from("rubrics").select("id, course_id, title, criteria").eq("id", assignment.rubric_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rubric = rubricData as Rubric | null;

  const students = ((studentData ?? []) as StudentRow[])
    .map((row) => {
      const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { id: row.user_id, name: p?.full_name || p?.email || row.user_id, email: p?.email ?? "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const submissions = (subData ?? []) as Submission[];
  const grades = (gradeData ?? []) as Grade[];
  if (students.length === 0) return <Empty>{t.grader.noStudents}</Empty>;

  const selectedId = typeof query.student === "string" && students.some((s) => s.id === query.student) ? query.student : students[0].id;
  const index = students.findIndex((s) => s.id === selectedId);
  const selected = students[index];
  const prevStudent = students[(index - 1 + students.length) % students.length];
  const nextStudent = students[(index + 1) % students.length];
  const submission = submissions.find((s) => s.student_id === selected.id) ?? null;
  const grade = grades.find((g) => g.student_id === selected.id) ?? null;
  const done = grades.filter((g) => g.score !== null).length;

  let ratings: RubricRatings = {};
  if (rubric) {
    const { data: assessment } = await supabase
      .from("rubric_assessments")
      .select("ratings")
      .eq("assignment_id", assignment.id)
      .eq("student_id", selected.id)
      .maybeSingle();
    ratings = (assessment?.ratings ?? {}) as RubricRatings;
  }

  let fileUrl: string | null = null;
  if (submission?.file_path) {
    const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(submission.file_path, 60 * 30);
    fileUrl = signed?.signedUrl ?? null;
  }
  const isImage = /\.(png|jpe?g|webp|gif|heic)$/i.test(submission?.file_name ?? "");
  const isPdf = /\.pdf$/i.test(submission?.file_name ?? "");
  const late = submission && assignment.due_at ? new Date(submission.submitted_at) > new Date(assignment.due_at) : false;
  const base = `/courses/${course.id}/assignments/${assignment.id}/grade`;
  const statusOf = (id: string) => {
    const g = grades.find((row) => row.student_id === id);
    if (g && g.score !== null) return "graded" as const;
    return submissions.some((row) => row.student_id === id) ? ("submitted" as const) : ("missing" as const);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/courses/${course.id}/assignments/${assignment.id}`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline">
            <ArrowLeft size={15} aria-hidden />
            {assignment.title}
          </Link>
          <h2 className="font-display text-2xl font-semibold">{t.grader.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-ochre-500" style={{ width: `${(done / students.length) * 100}%` }} />
          </div>
          <span className="num text-[13.5px] font-semibold text-slate-600">{fmt(t.speed.progress, { done, total: students.length })}</span>
        </div>
      </div>
      <Flash error={errorText(t, typeof query.error === "string" ? query.error : null)} ok={query.ok ? t.common.saved : null} />

      <div className="grid gap-4 xl:grid-cols-[240px_1fr_360px] lg:grid-cols-[240px_1fr]">
        {/* Students */}
        <Card className="max-h-[78vh] overflow-y-auto">
          <ul className="p-1.5">
            {students.map((s) => {
              const st = statusOf(s.id);
              const g = grades.find((row) => row.student_id === s.id);
              const active = s.id === selected.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`?student=${s.id}`}
                    aria-current={active ? "true" : undefined}
                    className={cx("flex items-center gap-2.5 rounded-xl px-2.5 py-2", active ? "bg-ardoise text-chalk" : "hover:bg-slate-50")}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "h-2 w-2 shrink-0 rotate-45",
                        st === "graded" ? "bg-leaf-500" : st === "submitted" ? "bg-ochre-500" : "bg-slate-300",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.name}</span>
                    {g && g.score !== null ? (
                      <span className={cx("num text-[13px] font-bold", active ? "text-ochre-300" : "text-slate-500")}>{formatScore(locale, g.score)}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* The work */}
        <Card className="flex min-h-[60vh] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <Link href={`?student=${prevStudent.id}`} aria-label={t.speed.prev} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100">
              <ChevronLeft size={18} aria-hidden />
            </Link>
            <Avatar name={selected.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold">{selected.name}</p>
              <p className="flex items-center gap-2 text-[12.5px] text-slate-500">
                {submission ? formatDateTime(locale, submission.submitted_at) : t.speed.status[statusOf(selected.id)]}
                {late ? <Badge tone="danger">{t.assignments.late}</Badge> : null}
                {!submission && isPast(assignment.due_at) ? <Badge tone="danger">{t.assignments.notSubmitted}</Badge> : null}
              </p>
            </div>
            <Link href={`?student=${nextStudent.id}`} aria-label={t.speed.next} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100">
              <ChevronRight size={18} aria-hidden />
            </Link>
          </div>
          <div className="relative flex-1 bg-slate-50/60 p-4">
            {!submission ? (
              <div className="grid h-full min-h-[40vh] place-items-center">
                <div aria-hidden className="absolute inset-0" style={{ backgroundImage: NDOP_INK }} />
                <p className="relative max-w-sm text-center text-[15px] text-slate-500">{t.speed.noWork}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {submission.body ? (
                  <div className="rounded-xl border border-slate-200 bg-paper p-5">
                    <p className="prose-lite font-mono text-[14px] text-slate-800">{submission.body}</p>
                  </div>
                ) : null}
                {fileUrl ? (
                  <div className="space-y-2">
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[14px] font-semibold text-brand-600 hover:underline">
                      <FileText size={16} aria-hidden />
                      {submission.file_name ?? t.speed.openFile}
                      <ExternalLink size={13} aria-hidden />
                    </a>
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl} alt={submission.file_name ?? ""} className="max-h-[70vh] rounded-xl border border-slate-200 bg-white" />
                    ) : null}
                    {isPdf ? <iframe src={fileUrl} title={submission.file_name ?? "PDF"} className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white" /> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </Card>

        {/* Marking */}
        <Card className="self-start p-4 lg:col-span-2 xl:col-span-1">
          {rubric ? (
            <form action={saveRubricGrade} className="space-y-4" key={`r-${selected.id}`}>
              <input type="hidden" name="course_id" value={course.id} />
              <input type="hidden" name="assignment_id" value={assignment.id} />
              <input type="hidden" name="student_id" value={selected.id} />
              <input type="hidden" name="next_student" value={nextStudent.id} />
              <p className="text-[13px] font-bold text-slate-500">
                {t.speed.rubric}: {rubric.title}
              </p>
              <RubricScorer
                criteria={rubric.criteria}
                initial={ratings}
                pointsPossible={Number(assignment.points_possible)}
                locale={locale}
                labels={{ total: t.speed.total, points: t.rubrics.points, comment: t.grader.comment }}
              />
              <Field label={t.grader.comment}>
                <Textarea name="comment" rows={3} defaultValue={grade?.comment ?? ""} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="intent" value="next" className="flex-1">
                  {t.grader.saveNext}
                </Button>
                <Button type="submit" name="intent" value="stay" variant="secondary">
                  {t.common.save}
                </Button>
              </div>
            </form>
          ) : (
            <form action={saveGrade} className="space-y-4" key={selected.id}>
              <input type="hidden" name="course_id" value={course.id} />
              <input type="hidden" name="assignment_id" value={assignment.id} />
              <input type="hidden" name="student_id" value={selected.id} />
              <input type="hidden" name="next_student" value={nextStudent.id} />
              <input type="hidden" name="points_possible" value={assignment.points_possible} />
              <Field label={`${t.grader.score} (${t.grader.outOf} ${formatScore(locale, assignment.points_possible)})`}>
                <Input
                  name="score"
                  inputMode="decimal"
                  defaultValue={grade?.score !== null && grade?.score !== undefined ? String(grade.score) : ""}
                  className="h-14 max-w-44 font-display text-2xl font-semibold"
                  placeholder="14,5"
                  autoFocus
                />
              </Field>
              <Field label={t.grader.comment}>
                <Textarea name="comment" rows={5} defaultValue={grade?.comment ?? ""} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="intent" value="next" className="flex-1">
                  {t.grader.saveNext}
                </Button>
                <Button type="submit" name="intent" value="stay" variant="secondary">
                  {t.common.save}
                </Button>
              </div>
            </form>
          )}
          <Link href={`${base}?student=${nextStudent.id}`} className="mt-3 block text-center text-[13px] font-semibold text-slate-500 hover:text-slate-800">
            {t.speed.next}: {nextStudent.name}
          </Link>
        </Card>
      </div>
    </div>
  );
}
