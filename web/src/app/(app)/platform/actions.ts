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
  const { error } = await supabase.rpc("create_school", {
    p_name: name,
    p_slug: slug,
    p_default_locale: formData.get("locale") === "fr" ? "fr" : "en",
    p_owner_email: field(formData, "owner_email", 320),
    p_owner_name: field(formData, "owner_name", 200),
  });
  if (error) redirect(`/platform?error=${error.code === "23505" ? "slug_taken" : error.message.includes("forbidden") ? "forbidden" : "generic"}`);
  revalidatePath("/platform");
  // The new owner link shows under "Owner links not used yet"; tokens stay out of the address bar.
  redirect("/platform");
}

export async function markRequestHandled(formData: FormData) {
  const id = field(formData, "id", 40);
  const { supabase, user } = await actionSession();
  await supabase.from("demo_requests").update({ handled_at: new Date().toISOString(), handled_by: user.id }).eq("id", id);
  revalidatePath("/platform", "layout");
  redirect("/platform/requests#demos");
}

// --- The Ardoise team: the owner adds assistants, each with their own login ---------------------

const TEAM = "/platform/team";

export async function createTeamInvite(formData: FormData) {
  const name = field(formData, "full_name", 200);
  const email = field(formData, "email", 320);
  if (name.length < 2) redirect(`${TEAM}?error=invalid`);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("create_team_invitation", { p_email: email, p_full_name: name });
  if (error) redirect(`${TEAM}?error=${error.message.includes("forbidden") ? "forbidden" : "invalid"}`);
  revalidatePath(TEAM);
  redirect(`${TEAM}?created=1`);
}

export async function revokeTeamInvite(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("revoke_team_invitation", { p_invitation: field(formData, "id", 40) });
  revalidatePath(TEAM);
  redirect(error ? `${TEAM}?error=forbidden` : TEAM);
}

export async function removeTeammate(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("remove_teammate", { p_user: field(formData, "user_id", 40) });
  revalidatePath(TEAM);
  redirect(error ? `${TEAM}?error=forbidden` : `${TEAM}?ok=1`);
}
