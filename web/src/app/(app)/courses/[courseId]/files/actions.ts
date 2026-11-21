"use server";

import { revalidatePath } from "next/cache";
import { actionSession } from "@/lib/session";

/** Records files the browser has just uploaded to course-files storage. */
export async function recordFiles(input: {
  courseId: string;
  folder: string;
  files: Array<{ name: string; path: string; size: number; type: string }>;
}): Promise<{ ok: boolean }> {
  const { supabase } = await actionSession();
  const rows = input.files
    .filter((f) => f.path.startsWith(`${input.courseId}/`))
    .map((f) => ({
      course_id: input.courseId,
      folder: input.folder.trim().slice(0, 80),
      name: f.name.slice(0, 200),
      storage_path: f.path,
      size_bytes: Math.max(0, Math.round(f.size)),
      mime_type: f.type || null,
    }));
  if (!rows.length) return { ok: false };
  const { error } = await supabase.from("course_files").insert(rows);
  revalidatePath(`/courses/${input.courseId}/files`);
  return { ok: !error };
}

export async function toggleFile(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const published = formData.get("published") === "true";
  const { supabase } = await actionSession();
  await supabase.from("course_files").update({ published }).eq("id", id);
  revalidatePath(`/courses/${courseId}/files`);
}

export async function deleteFile(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  const { data } = await supabase.from("course_files").select("storage_path").eq("id", id).maybeSingle();
  if (data?.storage_path) await supabase.storage.from("course-files").remove([data.storage_path]);
  await supabase.from("course_files").delete().eq("id", id);
  revalidatePath(`/courses/${courseId}/files`);
}
