"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

export async function createSchool(formData: FormData) {
  const name = field(formData, "name", 200);
  const slug = field(formData, "slug", 60).toLowerCase();
  if (name.length < 2 || !/^[a-z0-9-]{2,60}$/.test(slug)) redirect("/platform?error=invalid");
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("create_school", {
    p_name: name,
    p_slug: slug,
    p_default_locale: formData.get("locale") === "fr" ? "fr" : "en",
    p_owner_email: field(formData, "owner_email", 320),
    p_owner_name: field(formData, "owner_name", 200),
  });
  if (error) redirect(`/platform?error=${error.code === "23505" ? "slug_taken" : error.message.includes("forbidden") ? "forbidden" : "generic"}`);
  revalidatePath("/platform");
  redirect(`/platform?token=${encodeURIComponent(String(data))}&school=${encodeURIComponent(name)}`);
}

export async function markRequestHandled(formData: FormData) {
  const id = field(formData, "id", 40);
  const { supabase, user } = await actionSession();
  await supabase.from("demo_requests").update({ handled_at: new Date().toISOString(), handled_by: user.id }).eq("id", id);
  revalidatePath("/platform");
  redirect("/platform");
}
