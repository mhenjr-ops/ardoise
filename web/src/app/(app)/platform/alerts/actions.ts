"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";

const BACK = "/platform/alerts";

export async function markAlertSeen(formData: FormData) {
  const id = Number(formData.get("id"));
  const { supabase, user } = await actionSession();
  if (Number.isSafeInteger(id) && id > 0) {
    await supabase.from("alerts").update({ seen_at: new Date().toISOString(), seen_by: user.id }).eq("id", id).is("seen_at", null);
  }
  revalidatePath("/platform", "layout");
  redirect(BACK);
}

export async function markAllAlertsSeen() {
  const { supabase, user } = await actionSession();
  await supabase.from("alerts").update({ seen_at: new Date().toISOString(), seen_by: user.id }).is("seen_at", null);
  revalidatePath("/platform", "layout");
  redirect(BACK);
}
