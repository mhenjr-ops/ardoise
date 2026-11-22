"use server";

import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function claimMatricule(formData: FormData) {
  const school = field(formData, "school_code").toLowerCase().slice(0, 60);
  const matricule = field(formData, "matricule").toUpperCase().slice(0, 40);
  const fullName = field(formData, "full_name").slice(0, 200);
  if (!school || matricule.length < 2) redirect("/onboarding?error=invalid");
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("claim_matricule", { p_school: school, p_matricule: matricule, p_full_name: fullName });
  if (error) redirect("/onboarding?error=generic");
  const status = (data as { status: string }).status;
  if (status === "linked") redirect("/dashboard");
  const q = new URLSearchParams({ claim: status, school, matricule });
  redirect(`/onboarding?${q.toString()}`);
}

export async function disputeMatricule(formData: FormData) {
  const school = field(formData, "school_code").toLowerCase().slice(0, 60);
  const matricule = field(formData, "matricule").toUpperCase().slice(0, 40);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("dispute_matricule", { p_school: school, p_matricule: matricule });
  if (error) redirect("/onboarding?error=generic");
  redirect("/onboarding?claim=disputed");
}
