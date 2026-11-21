"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession, getSession } from "@/lib/session";
import { cameroonLocalToIso } from "@/lib/format";
import { errorCode } from "@/lib/errors";

const KINDS = ["class", "exam", "event", "office_hours", "holiday"] as const;

export async function createEvent(formData: FormData) {
  const back = String(formData.get("back") ?? "/calendar");
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "event");
  const scope = String(formData.get("scope") ?? "");
  const startsAt = cameroonLocalToIso(String(formData.get("starts_at") ?? ""));
  let endsAt = cameroonLocalToIso(String(formData.get("ends_at") ?? ""));
  const until = String(formData.get("repeat_until") ?? "").trim();
  const sep = back.includes("?") ? "&" : "?";
  if (!title || !startsAt || !KINDS.includes(kind as (typeof KINDS)[number]) || !scope) redirect(`${back}${sep}error=invalid`);
  if (!endsAt || endsAt <= startsAt) endsAt = new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();

  const { supabase } = await actionSession();
  const { institution } = await getSession();
  const row = {
    title,
    kind,
    starts_at: startsAt,
    ends_at: endsAt,
    location: String(formData.get("location") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim(),
    repeat_weekly_until: /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : null,
    course_id: scope === "institution" ? null : scope,
    institution_id: institution?.id,
  };
  const { error } = await supabase.from("calendar_events").insert(row);
  if (error) redirect(`${back}${sep}error=${errorCode(error) === "generic" ? "forbidden" : errorCode(error)}`);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(back);
}

export async function deleteEvent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("calendar_events").delete().eq("id", id);
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}
