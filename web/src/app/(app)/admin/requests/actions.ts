"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

const BACK = "/admin/requests";

/** A university asks the Ardoise team for something: a structure change, next year's semesters, a problem. */
export async function sendRequest(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const institutionId = String(formData.get("institution_id") ?? "");
  if (body.length < 3) redirect(`${BACK}?error=invalid`);
  const { supabase, user } = await actionSession();
  const { error } = await supabase.from("support_requests").insert({ institution_id: institutionId, body, created_by: user.id });
  if (error) redirect(`${BACK}?error=${errorCode(error)}`);
  revalidatePath(BACK);
  revalidatePath("/platform/requests");
  redirect(`${BACK}?sent=1`);
}
