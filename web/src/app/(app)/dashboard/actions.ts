"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

const COLORS = ["#1F3B36", "#B4532A", "#283669", "#8D5B07", "#3D685E", "#74341B", "#2F5E8A", "#5B4B8A"];

/** A head of department (or dean) adds a course to one of their departments. */
export async function createDepartmentCourse(formData: FormData) {
  const institutionId = String(formData.get("institution_id") ?? "");
  const departmentId = String(formData.get("department_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase().slice(0, 40);
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const level = String(formData.get("level") ?? "").trim().slice(0, 40) || null;
  if (!code || !title || !departmentId) redirect("/dashboard?error=invalid");
  const { supabase } = await actionSession();
  const { count } = await supabase.from("courses").select("id", { count: "exact", head: true }).eq("institution_id", institutionId);
  const { data, error } = await supabase
    .from("courses")
    .insert({
      institution_id: institutionId,
      department_id: departmentId,
      code,
      title,
      level,
      language: formData.get("language") === "fr" ? "fr" : "en",
      color: COLORS[(count ?? 0) % COLORS.length],
    })
    .select("id")
    .single();
  if (error || !data) redirect("/dashboard?error=forbidden");
  revalidatePath("/dashboard");
  redirect(`/courses/${data.id}/people`);
}
