import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Circle, Download, FileText } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, formatScore, isPast } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Flash, Input, Textarea } from "@/components/ui";
import type { Assignment, Grade, Submission } from "@/lib/types";
import { saveGrade } from "./actions";

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
    .select("id, course_id, title, description, due_at, points_possible, submission_types, component, weight, published, created_at")
    .eq("id", assignmentId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!data) notFound();
  const assignment = data as Assignment;

  const [{ data: studentData }, { data: subData }, { data: gradeData }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("user_id, profile:profiles(full_name, email)")
      .eq("course_id", course.id)
      .eq("role", "student"),
    supabase
      .from("submissions")
      .select("id, assignment_id, student_id, body, file_path, file_name, submitted_at")
      .eq("assignment_id", assignment.id),
    supabase.from("grades").select("id, assignment_id, student_id, score, comment, graded_at").eq("assignment_id", assignment.id),
  ]);

  const students = ((studentData ?? []) as StudentRow[])
    .map((row) => {
      const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { id: row.user_id, name: p?.full_name || p?.email || row.user_id, email: p?.email ?? "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const submissions = (subData ?? []) as Submission[];
  const grades = (gradeData ?? []) as Grade[];

  if (students.length === 0) {
    return <Empty>{t.grader.noStudents}</Empty>;
  }

  const selectedId =
    typeof query.student === "string" && students.some((s) => s.id === query.student) ? query.student : students[0].id;
  const index = students.findIndex((s) => s.id === selectedId);
  const selected = students[index];
  const nextStudent = students[(index + 1) % students.length];
  const submission = submissions.find((s) => s.student_id === selected.id) ?? null;
  const grade = grades.find((g) => g.student_id === selected.id) ?? null;

  let fileUrl: string | null = null;
  if (submission?.file_path) {
    const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(submission.file_path, 60 * 30);
    fileUrl = signed?.signedUrl ?? null;
  }
  const isImage = /\.(png|jpe?g|webp|gif|heic)$/i.test(submission?.file_name ?? "");
  const isPdf = /\.pdf$/i.test(submission?.file_name ?? "");
  const lateSubmission =
    submission && assignment.due_at ? new Date(submission.submitted_at) > new Date(assignment.due_at) : false;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/courses/${course.id}/assignments/${assignment.id}`} className="text-sm text-brand-700 hover:underline">
            ← {assignment.title}
          </Link>
          <h2 className="text-lg font-semibold text-slate-900">{t.grader.title}</h2>
        </div>
        <span className="text-sm text-slate-500">
          {grades.filter((g) => g.score !== null).length}/{students.length} {t.assignments.graded}
        </span>
      </div>
      <Flash
        error={errorText(t, typeof query.error === "string" ? query.error : null)}
        ok={query.ok ? t.common.saved : null}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto">
          <ul className="divide-y divide-slate-100">
            {students.map((s) => {
              const g = grades.find((row) => row.student_id === s.id);
              const hasSub = submissions.some((row) => row.student_id === s.id);
              const active = s.id === selected.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`?student=${s.id}`}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${active ? "bg-brand-50" : "hover:bg-slate-50"}`}
                  >
                    {g && g.score !== null ? (
                      <CheckCircle2 size={16} className="shrink-0 text-brand-600" aria-hidden />
                    ) : (
                      <Circle size={16} className={`shrink-0 ${hasSub ? "text-amber-500" : "text-slate-300"}`} aria-hidden />
                    )}
                    <span className={`min-w-0 flex-1 truncate ${active ? "font-semibold text-brand-800" : "text-slate-800"}`}>
                      {s.name}
                    </span>
                    {g && g.score !== null ? (
                      <span className="text-xs text-slate-500">{formatScore(locale, g.score)}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{selected.name}</p>
                <p className="text-xs text-slate-500">{selected.email}</p>
              </div>
              {submission ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {formatDateTime(locale, submission.submitted_at)}
                  {lateSubmission ? <Badge tone="danger">{t.assignments.late}</Badge> : null}
                </div>
              ) : isPast(assignment.due_at) ? (
                <Badge tone="danger">{t.assignments.notSubmitted}</Badge>
              ) : null}
            </div>

            {!submission ? (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{t.grader.noSubmission}</p>
            ) : (
              <div className="space-y-4">
                {submission.body ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="prose-lite text-sm text-slate-800">{submission.body}</p>
                  </div>
                ) : null}
                {fileUrl ? (
                  <div className="space-y-2">
                    <a href={fileUrl} className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                      {isPdf ? <FileText size={16} aria-hidden /> : <Download size={16} aria-hidden />}
                      {submission.file_name ?? t.assignments.downloadFile}
                    </a>
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl} alt={submission.file_name ?? ""} className="max-h-[60vh] rounded-lg border border-slate-200" />
                    ) : null}
                    {isPdf ? (
                      <iframe src={fileUrl} title={submission.file_name ?? "PDF"} className="h-[60vh] w-full rounded-lg border border-slate-200" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="p-5">
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
                  className="max-w-40 text-lg font-semibold"
                  placeholder="14,5"
                />
              </Field>
              <Field label={t.grader.comment}>
                <Textarea name="comment" rows={4} defaultValue={grade?.comment ?? ""} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="intent" value="next">
                  {t.grader.saveNext}
                </Button>
                <Button type="submit" name="intent" value="stay" variant="secondary">
                  {t.grader.saveGrade}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
