"use server";

import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

export async function createInstitution(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (name.length < 2 || !/^[a-z0-9-]{2,60}$/.test(slug)) redirect("/onboarding?error=invalid");

  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("create_institution", { p_name: name, p_slug: slug });
  if (error) {
    redirect(`/onboarding?error=${error.code === "23505" ? "slug_taken" : "generic"}`);
  }
  redirect("/admin");
}
