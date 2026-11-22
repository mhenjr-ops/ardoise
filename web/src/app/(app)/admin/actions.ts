"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

const COLORS = ["#0E7C66", "#1F6FEB", "#8250DF", "#BF3989", "#CF222E", "#BC4C00", "#9A6700", "#1A7F37", "#0969DA", "#6E7781"];

function rpcErrorCode(message: string) {
  if (message.includes("user_not_found")) return "user_not_found";
  if (message.includes("forbidden")) return "forbidden";
  return "generic";
}

export async function createCourse(formData: FormData) {
  const institutionId = String(formData.get("institution_id") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const title = String(formData.get("title") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim() || null;
  const language = formData.get("language") === "fr" ? "fr" : "en";
  const teacherEmail = String(formData.get("teacher_email") ?? "").trim();
  const departmentId = String(formData.get("department_id") ?? "") || null;
  if (!code || !title) redirect("/admin?error=invalid");

  const { supabase } = await actionSession();
  const { count } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("institution_id", institutionId);
  const color = COLORS[(count ?? 0) % COLORS.length];

  const { data, error } = await supabase
    .from("courses")
    .insert({ institution_id: institutionId, code, title, level, language, color, department_id: departmentId })
    .select("id")
    .single();
  if (error || !data) redirect("/admin?error=forbidden");

  if (teacherEmail) {
    const { error: enrollError } = await supabase.rpc("enroll_by_email", {
      p_course: data.id,
      p_email: teacherEmail,
      p_role: "teacher",
    });
    if (enrollError) redirect(`/courses/${data.id}/people?error=${rpcErrorCode(enrollError.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect(`/courses/${data.id}`);
}
