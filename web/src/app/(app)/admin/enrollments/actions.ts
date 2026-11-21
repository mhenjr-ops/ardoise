"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function registerStudents(formData: FormData) {
  const programme = str(formData, "programme_id");
  const year = str(formData, "academic_year_id");
  const level = str(formData, "level");
  const emails = str(formData, "emails")
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .slice(0, 2000);
  const back = `/admin/enrollments?programme=${programme}&year=${year}`;
  if (!programme || !year || !level || emails.length === 0) redirect(`${back}&error=invalid`);

  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("register_students", {
    p_programme: programme,
    p_year: year,
    p_level: level,
    p_emails: emails,
  });
  if (error) redirect(`${back}&error=${errorCode(error)}`);
  const result = data as { added: number; not_found: string[] };
  revalidatePath("/admin/enrollments");
  const missing = result.not_found.length ? `&missing=${encodeURIComponent(result.not_found.slice(0, 50).join(","))}` : "";
  redirect(`${back}&added=${result.added}${missing}`);
}

export async function removeEnrollment(formData: FormData) {
  const id = str(formData, "id");
  const back = str(formData, "back") || "/admin/enrollments";
  const { supabase } = await actionSession();
  await supabase.from("programme_enrollments").delete().eq("id", id);
  revalidatePath("/admin/enrollments");
  redirect(back);
}
