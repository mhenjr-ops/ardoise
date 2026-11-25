"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { needsCode } from "@/lib/auth-flow";

/** Turns two-step login off, for accounts that may (never for those that must have it). */
export async function turnOffTwoStep(formData: FormData) {
  const factorId = String(formData.get("factor") ?? "").slice(0, 40);
  const supabase = await createClient();
  if (await needsCode(supabase)) redirect("/login/verify?next=/security");
  const { data: status } = await supabase.rpc("account_status");
  if ((status as { mfa_required?: boolean } | null)?.mfa_required) redirect("/security?error=required");
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  // A fresh token without the "code entered" mark, now that there is no code.
  if (!error) await supabase.auth.refreshSession();
  redirect(error ? "/security?error=generic" : "/security?ok=off");
}
