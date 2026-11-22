"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const KNOWN = ["invitation_invalid", "invitation_used", "invitation_expired", "invitation_wrong_email"];

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "").slice(0, 100);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const code = KNOWN.find((k) => error.message.includes(k)) ?? "generic";
    redirect(`/join/${token}?error=${code}`);
  }
  redirect("/dashboard");
}

/** Sign out and come back to the same invitation (to accept it with another account). */
export async function signOutToInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "").slice(0, 100);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/join/${token}`);
}
