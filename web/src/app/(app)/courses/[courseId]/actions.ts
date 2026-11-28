"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

export async function updateDescription(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const description = String(formData.get("description") ?? "");
  const { supabase } = await actionSession();
  // RLS only lets course staff update the course.
  await supabase.from("courses").update({ description }).eq("id", courseId);
  revalidatePath(`/courses/${courseId}`);
}

/** A student leaves a course they were added to because of their department and year. */
export async function dropCourse(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "").slice(0, 40);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("drop_course", { p_course: courseId });
  if (error) redirect(`/courses/${courseId}`);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
