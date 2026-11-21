"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

export async function savePage(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const published = formData.get("published") === "on";
  const back = `/courses/${courseId}/pages/${id}`;
  if (!title) redirect(`${back}?error=invalid`);

  const { supabase } = await actionSession();
  const { error } = await supabase.from("pages").update({ title, body, published }).eq("id", id);
  if (error) redirect(`${back}?error=forbidden`);
  // Keep the module item's label in step with the page title.
  await supabase.from("module_items").update({ title }).eq("page_id", id);
  revalidatePath(back);
  revalidatePath(`/courses/${courseId}/modules`);
  redirect(`${back}?ok=1`);
}
