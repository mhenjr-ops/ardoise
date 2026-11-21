"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

export async function createTopic(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 20000);
  const back = `/courses/${courseId}/discussions`;
  if (!title) redirect(`${back}?error=invalid`);
  const { supabase } = await actionSession();
  const { data, error } = await supabase.from("discussion_topics").insert({ course_id: courseId, title, body }).select("id").single();
  if (error || !data) redirect(`${back}?error=${errorCode(error)}`);
  revalidatePath(back);
  redirect(`${back}/${data.id}`);
}

export async function postReply(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const topicId = String(formData.get("topic_id") ?? "");
  const parentId = String(formData.get("parent_id") ?? "") || null;
  const body = String(formData.get("body") ?? "").trim();
  const back = `/courses/${courseId}/discussions/${topicId}`;
  if (!body) redirect(back);
  const { supabase } = await actionSession();
  const { data, error } = await supabase
    .from("discussion_replies")
    .insert({ topic_id: topicId, parent_id: parentId, body })
    .select("id")
    .single();
  if (error || !data) redirect(`${back}?error=${errorCode(error)}`);
  revalidatePath(back);
  revalidatePath(`/courses/${courseId}/discussions`);
  redirect(`${back}#r-${data.id}`);
}

export async function moderateTopic(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const topicId = String(formData.get("topic_id") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = formData.get("value") === "true";
  if (field !== "pinned" && field !== "locked") return;
  const { supabase } = await actionSession();
  await supabase.from("discussion_topics").update({ [field]: value }).eq("id", topicId);
  revalidatePath(`/courses/${courseId}/discussions`);
  revalidatePath(`/courses/${courseId}/discussions/${topicId}`);
}

export async function deleteTopic(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const topicId = String(formData.get("topic_id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("discussion_topics").delete().eq("id", topicId);
  revalidatePath(`/courses/${courseId}/discussions`);
  redirect(`/courses/${courseId}/discussions`);
}

export async function deleteReply(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const topicId = String(formData.get("topic_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("discussion_replies").delete().eq("id", id);
  revalidatePath(`/courses/${courseId}/discussions/${topicId}`);
}
