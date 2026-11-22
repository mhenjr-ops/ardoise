"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

export async function requestDemo(formData: FormData) {
  // Bots fill every field; people never see this one.
  if (field(formData, "website", 200)) redirect("/request-demo?sent=1");
  const fullName = field(formData, "full_name", 200);
  const email = field(formData, "email", 320);
  const institution = field(formData, "institution", 200);
  if (fullName.length < 2 || institution.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/request-demo?error=invalid");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_demo", {
    p_full_name: fullName,
    p_email: email,
    p_phone: field(formData, "phone", 40),
    p_institution: institution,
    p_job_title: field(formData, "job_title", 200),
    p_city: field(formData, "city", 120),
    p_message: field(formData, "message", 4000),
  });
  if (error) redirect(`/request-demo?error=${error.message.includes("too_many_requests") ? "too_many" : "generic"}`);
  redirect("/request-demo?sent=1");
}
