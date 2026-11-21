"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

/** Saves a mark (/points) and comment; works with or without an online submission. */
export async function saveGrade(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const nextStudent = String(formData.get("next_student") ?? "");
  const pointsPossible = Number(formData.get("points_possible") ?? 20);
  const rawScore = String(formData.get("score") ?? "").trim().replace(",", ".");
  const comment = String(formData.get("comment") ?? "").trim();
  const base = `/courses/${courseId}/assignments/${assignmentId}/grade`;

  const score = rawScore === "" ? null : Number(rawScore);
  if (score !== null && (Number.isNaN(score) || score < 0 || score > pointsPossible)) {
    redirect(`${base}?student=${studentId}&error=invalid`);
  }

  const { supabase } = await actionSession();
  const { error } = await supabase
    .from("grades")
    .upsert(
      { assignment_id: assignmentId, student_id: studentId, score, comment: comment || null },
      { onConflict: "assignment_id,student_id" },
    );
  if (error) redirect(`${base}?student=${studentId}&error=forbidden`);

  revalidatePath(base);
  revalidatePath(`/courses/${courseId}/grades`);
  revalidatePath(`/courses/${courseId}/assignments`);
  const target = formData.get("intent") === "next" && nextStudent ? nextStudent : studentId;
  redirect(`${base}?student=${target}&ok=1`);
}

/** Scores the assignment's rubric; the database turns it into the mark. */
export async function saveRubricGrade(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const nextStudent = String(formData.get("next_student") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const base = `/courses/${courseId}/assignments/${assignmentId}/grade`;

  const ratings: Record<string, { level: string; comment?: string }> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("crit_") && typeof value === "string" && value) {
      const id = key.slice(5);
      const c = String(formData.get(`comment_${id}`) ?? "").trim();
      ratings[id] = c ? { level: value, comment: c } : { level: value };
    }
  }

  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("save_rubric_assessment", {
    p_assignment: assignmentId,
    p_student: studentId,
    p_ratings: ratings,
    p_comment: comment || null,
  });
  if (error) redirect(`${base}?student=${studentId}&error=${error.message.includes("forbidden") ? "forbidden" : "invalid"}`);

  revalidatePath(base);
  revalidatePath(`/courses/${courseId}/grades`);
  const target = formData.get("intent") === "next" && nextStudent ? nextStudent : studentId;
  redirect(`${base}?student=${target}&ok=1`);
}
