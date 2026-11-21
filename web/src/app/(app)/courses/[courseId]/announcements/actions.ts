"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

export async function postAnnouncement(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const path = `/courses/${courseId}/announcements`;
  if (!title) redirect(`${path}?error=invalid`);

  const { supabase, user } = await actionSession();
  const { error } = await supabase.from("announcements").insert({ course_id: courseId, title, body, author_id: user.id });
  if (error) redirect(`${path}?error=forbidden`);
  // Sprint 2: fan out to push, SMS and WhatsApp from a background job.
  revalidatePath(path);
  revalidatePath(`/courses/${courseId}`);
  redirect(path);
}

export async function deleteAnnouncement(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("announcements").delete().eq("id", id);
  revalidatePath(`/courses/${courseId}/announcements`);
}
