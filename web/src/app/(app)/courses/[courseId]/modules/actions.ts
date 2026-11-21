"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

function path(courseId: string) {
  return `/courses/${courseId}/modules`;
}

export async function createModule(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`${path(courseId)}?error=invalid`);
  const { supabase } = await actionSession();

  const { data: last } = await supabase
    .from("modules")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("modules")
    .insert({ course_id: courseId, title, position: (last?.position ?? 0) + 1 });
  if (error) redirect(`${path(courseId)}?error=forbidden`);
  revalidatePath(path(courseId));
}

export async function toggleModule(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const published = formData.get("published") === "true";
  const { supabase } = await actionSession();
  await supabase.from("modules").update({ published: !published }).eq("id", id);
  revalidatePath(path(courseId));
}

export async function deleteModule(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("modules").delete().eq("id", id);
  revalidatePath(path(courseId));
}

export async function addItem(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const moduleId = String(formData.get("module_id") ?? "");
  const type = String(formData.get("item_type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const back = path(courseId);
  const { supabase } = await actionSession();

  const { data: last } = await supabase
    .from("module_items")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1;

  let row: Record<string, unknown> | null = null;

  if (type === "page") {
    if (!title) redirect(`${back}?error=invalid`);
    const body = String(formData.get("body") ?? "");
    const { data: page, error } = await supabase
      .from("pages")
      .insert({ course_id: courseId, title, body })
      .select("id")
      .single();
    if (error || !page) redirect(`${back}?error=forbidden`);
    row = { item_type: "page", title, page_id: page.id };
  } else if (type === "assignment") {
    const assignmentId = String(formData.get("assignment_id") ?? "");
    const { data: assignment } = await supabase
      .from("assignments")
      .select("id, title")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!assignment) redirect(`${back}?error=invalid`);
    row = { item_type: "assignment", title: assignment.title, assignment_id: assignment.id };
  } else if (type === "link") {
    const url = String(formData.get("url") ?? "").trim();
    if (!title || !/^https?:\/\//i.test(url)) redirect(`${back}?error=invalid`);
    row = { item_type: "link", title, url };
  } else if (type === "header") {
    if (!title) redirect(`${back}?error=invalid`);
    row = { item_type: "header", title };
  } else {
    redirect(`${back}?error=invalid`);
  }

  const { error } = await supabase.from("module_items").insert({ ...row, module_id: moduleId, position });
  if (error) redirect(`${back}?error=forbidden`);
  revalidatePath(back);
}

export async function removeItem(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("module_items").delete().eq("id", id);
  revalidatePath(path(courseId));
}
