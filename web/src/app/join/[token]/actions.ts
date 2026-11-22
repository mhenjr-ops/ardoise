"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptAnyInvitation } from "@/lib/joining";

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "").slice(0, 100);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  const result = await acceptAnyInvitation(supabase, token);
  redirect("to" in result ? (result.to as "/dashboard") : `/join/${token}?error=${result.error}`);
}

/** Sign out and come back to the same invitation (to accept it with another account). */
export async function signOutToInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "").slice(0, 100);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/join/${token}`);
}
