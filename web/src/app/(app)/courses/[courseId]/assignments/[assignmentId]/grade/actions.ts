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
