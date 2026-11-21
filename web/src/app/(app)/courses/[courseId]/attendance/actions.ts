"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { cameroonLocalToIso } from "@/lib/format";

const STATUSES = ["present", "late", "absent", "excused"];

export async function createSession(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const topic = String(formData.get("topic") ?? "").trim().slice(0, 200);
  const startsAt = cameroonLocalToIso(String(formData.get("starts_at") ?? "")) ?? new Date().toISOString();
  const { supabase } = await actionSession();
  const { data, error } = await supabase.from("attendance_sessions").insert({ course_id: courseId, topic, starts_at: startsAt }).select("id").single();
  if (error || !data) redirect(`/courses/${courseId}/attendance?error=forbidden`);
  revalidatePath(`/courses/${courseId}/attendance`);
  redirect(`/courses/${courseId}/attendance/${data.id}`);
}

export async function saveRoll(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const rows: Array<{ session_id: string; student_id: string; status: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("s_") && typeof value === "string" && STATUSES.includes(value)) {
      rows.push({ session_id: sessionId, student_id: key.slice(2), status: value });
    }
  }
  const back = `/courses/${courseId}/attendance/${sessionId}`;
  const { supabase } = await actionSession();
  if (rows.length) {
    const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "session_id,student_id" });
    if (error) redirect(`${back}?error=forbidden`);
  }
  revalidatePath(back);
  revalidatePath(`/courses/${courseId}/attendance`);
  redirect(`${back}?ok=1`);
}

export async function openCode(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const minutes = Math.min(180, Math.max(1, Number(formData.get("minutes") ?? 10) || 10));
  const { supabase } = await actionSession();
  await supabase.rpc("open_checkin", { p_session: sessionId, p_minutes: minutes });
  revalidatePath(`/courses/${courseId}/attendance/${sessionId}`);
}

export async function closeCode(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const { supabase } = await actionSession();
  await supabase.rpc("close_checkin", { p_session: sessionId });
  revalidatePath(`/courses/${courseId}/attendance/${sessionId}`);
}

export async function deleteSession(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("attendance_sessions").delete().eq("id", sessionId);
  revalidatePath(`/courses/${courseId}/attendance`);
  redirect(`/courses/${courseId}/attendance`);
}

/** Student types the code shown in class. */
export async function checkIn(formData: FormData) {
  const back = String(formData.get("back") ?? "/dashboard");
  const code = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
  const { supabase } = await actionSession();
  const { data } = await supabase.rpc("check_in", { p_code: code });
  const r = (data ?? {}) as { status?: string; attendance?: string; course?: string };
  const sep = back.includes("?") ? "&" : "?";
  if (r.status === "ok") {
    revalidatePath(back);
    redirect(`${back}${sep}checkin=${r.attendance}&course=${encodeURIComponent(r.course ?? "")}`);
  }
  redirect(`${back}${sep}checkin=${r.status === "too_many_attempts" ? "too_many" : "invalid"}`);
}
