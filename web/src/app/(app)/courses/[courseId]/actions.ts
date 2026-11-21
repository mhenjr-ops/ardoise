"use server";

import { revalidatePath } from "next/cache";
import { actionSession } from "@/lib/session";

export async function updateDescription(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const description = String(formData.get("description") ?? "");
  const { supabase } = await actionSession();
  // RLS only lets course staff update the course.
  await supabase.from("courses").update({ description }).eq("id", courseId);
  revalidatePath(`/courses/${courseId}`);
}
