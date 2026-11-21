"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { cameroonLocalToIso } from "@/lib/format";

/** Records (or replaces) the student's submission after the browser has uploaded any file. */
export async function recordSubmission(input: {
  courseId: string;
  assignmentId: string;
  body: string;
  filePath: string | null;
  fileName: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await actionSession();

  if (input.filePath && !input.filePath.startsWith(`${input.courseId}/${input.assignmentId}/${user.id}/`)) {
    return { ok: false, error: "forbidden" };
  }

  const { error } = await supabase.from("submissions").upsert(
    {
      assignment_id: input.assignmentId,
      student_id: user.id,
      body: input.body || null,
      file_path: input.filePath,
      file_name: input.fileName,
    },
    { onConflict: "assignment_id,student_id" },
  );
  if (error) return { ok: false, error: "forbidden" };

  revalidatePath(`/courses/${input.courseId}/assignments/${input.assignmentId}`);
  revalidatePath(`/courses/${input.courseId}/assignments`);
  revalidatePath("/dashboard");
  return { ok: true };
}

const COMPONENTS = ["cc", "tp", "exam", "resit", "other"];

export async function updateAssignment(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const back = `/courses/${courseId}/assignments/${id}`;
  const title = String(formData.get("title") ?? "").trim();
  const points = Number(formData.get("points_possible") ?? 20);
  const weight = Number(formData.get("weight") ?? 1);
  const component = String(formData.get("component") ?? "cc");
  const types = formData.getAll("submission_types").map(String).filter((v) => v === "text" || v === "file");
  if (!title || !(points > 0) || !(weight >= 0) || !COMPONENTS.includes(component)) redirect(`${back}?error=invalid`);

  const { supabase } = await actionSession();
  const { error } = await supabase
    .from("assignments")
    .update({
      title,
      description: String(formData.get("description") ?? ""),
      due_at: cameroonLocalToIso(String(formData.get("due_at") ?? "") || null),
      points_possible: points,
      weight,
      component,
      published: formData.get("published") === "on",
      // A quiz stays a quiz: its type is not editable from this form.
      submission_types: formData.get("is_quiz") === "1" ? ["quiz"] : types.length ? types : ["text", "file"],
    })
    .eq("id", id);
  if (error) redirect(`${back}?error=forbidden`);
  await supabase.from("module_items").update({ title }).eq("assignment_id", id);
  revalidatePath(back);
  revalidatePath(`/courses/${courseId}/assignments`);
  redirect(`${back}?ok=1`);
}
