"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

function num(formData: FormData, key: string) {
  return Number(String(formData.get(key) ?? "").replace(",", "."));
}

export async function savePolicy(formData: FormData) {
  const institutionId = String(formData.get("institution_id") ?? "");
  const pass = num(formData, "pass_mark");
  const elim = num(formData, "elimination_mark");
  const bonus = num(formData, "jury_max_bonus");
  const weights = { cc: num(formData, "w_cc"), tp: num(formData, "w_tp"), exam: num(formData, "w_exam") };
  const rule = formData.get("resit_rule") === "max" ? "max" : "replace";
  const valid =
    pass >= 0 && pass <= 20 && elim >= 0 && elim <= 20 && bonus >= 0 && bonus <= 5 &&
    Object.values(weights).every((w) => Number.isFinite(w) && w >= 0) && Object.values(weights).some((w) => w > 0);
  if (!valid) redirect("/admin/policy?error=invalid");

  const { supabase } = await actionSession();
  const { error } = await supabase
    .from("grading_policies")
    .update({
      pass_mark: pass,
      elimination_mark: elim,
      jury_max_bonus: bonus,
      ue_compensation: formData.get("ue_compensation") === "on",
      resit_rule: rule,
      component_weights: weights,
      updated_at: new Date().toISOString(),
    })
    .eq("institution_id", institutionId);
  if (error) redirect(`/admin/policy?error=${errorCode(error)}`);
  revalidatePath("/admin/policy");
  redirect("/admin/policy?ok=1");
}
