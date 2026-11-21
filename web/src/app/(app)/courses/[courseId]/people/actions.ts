"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

export async function enrollPerson(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "student");
  const back = `/courses/${courseId}/people`;
  if (!email || !["student", "ta", "teacher"].includes(role)) redirect(`${back}?error=invalid`);

  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("enroll_by_email", { p_course: courseId, p_email: email, p_role: role });
  if (error) {
    const code = error.message.includes("user_not_found")
      ? "user_not_found"
      : error.message.includes("forbidden")
        ? "forbidden"
        : "generic";
    redirect(`${back}?error=${code}`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}

export async function unenroll(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("enrollments").delete().eq("course_id", courseId).eq("user_id", userId);
  revalidatePath(`/courses/${courseId}/people`);
}
