"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { cameroonLocalToIso } from "@/lib/format";

const COMPONENTS = ["cc", "tp", "exam", "resit", "other"];

export async function createAssignment(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const back = `/courses/${courseId}/assignments`;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const dueAt = cameroonLocalToIso(String(formData.get("due_at") ?? "") || null);
  const points = Number(formData.get("points_possible") ?? 20);
  const weight = Number(formData.get("weight") ?? 1);
  const component = String(formData.get("component") ?? "cc");
  const published = formData.get("published") === "on";
  const moduleId = String(formData.get("module_id") ?? "");
  const types = formData.getAll("submission_types").map(String).filter((v) => v === "text" || v === "file");

  if (!title || !(points > 0) || !(weight >= 0) || !COMPONENTS.includes(component)) {
    redirect(`${back}?error=invalid`);
  }

  const { supabase } = await actionSession();
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      course_id: courseId,
      title,
      description,
      due_at: dueAt,
      points_possible: points,
      weight,
      component,
      published,
      submission_types: types.length ? types : ["text", "file"],
      rubric_id: String(formData.get("rubric_id") ?? "") || null,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`${back}?error=forbidden`);

  if (moduleId) {
    const { data: last } = await supabase
      .from("module_items")
      .select("position")
      .eq("module_id", moduleId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("module_items").insert({
      module_id: moduleId,
      item_type: "assignment",
      title,
      assignment_id: data.id,
      position: (last?.position ?? 0) + 1,
    });
  }

  revalidatePath(back);
  redirect(`${back}/${data.id}`);
}
