"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

export async function saveSyllabus(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const syllabus = String(formData.get("syllabus") ?? "").slice(0, 50000);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("courses").update({ syllabus }).eq("id", courseId);
  const back = `/courses/${courseId}/syllabus`;
  if (error) redirect(`${back}?error=forbidden`);
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}
