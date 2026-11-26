"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

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
    p_status: formData.get("status") === "live" ? "live" : "prospect",
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const person = (formData: FormData, key: string) => {
  const v = field(formData, key, 40);
  return UUID.test(v) ? v : null;
};

export async function createTeamInvite(formData: FormData) {
  const name = field(formData, "full_name", 200);
  const email = field(formData, "email", 320);
  if (name.length < 2) redirect(`${TEAM}?error=invalid`);
  const { supabase } = await actionSession();
  const { data: token, error } = await supabase.rpc("create_team_invitation", {
    p_email: email,
    p_full_name: name,
    p_title: field(formData, "title", 80),
    p_reports_to: person(formData, "reports_to"),
  });
  if (error) redirect(`${TEAM}?error=${error.message.includes("forbidden") ? "forbidden" : "invalid"}`);
  // The page shows this one link (by id; the token never goes in the address bar).
  const { data: made } = await supabase.from("platform_invitations").select("id").eq("token", token as string).maybeSingle();
  revalidatePath(TEAM);
  redirect(made ? `${TEAM}?created=${made.id}` : TEAM);
}

/** The owner changes what someone does and whom they report to. */
export async function updateTeammate(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("update_teammate", {
    p_user: field(formData, "user_id", 40),
    p_title: field(formData, "title", 80),
    p_reports_to: person(formData, "reports_to"),
  });
  revalidatePath(TEAM);
  redirect(error ? `${TEAM}?error=${error.message.includes("forbidden") ? "forbidden" : "invalid"}` : `${TEAM}?ok=1`);
}

export async function updateTeamInvite(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("update_team_invitation", {
    p_invitation: field(formData, "id", 40),
    p_title: field(formData, "title", 80),
    p_reports_to: person(formData, "reports_to"),
  });
  revalidatePath(TEAM);
  redirect(error ? `${TEAM}?error=${error.message.includes("forbidden") ? "forbidden" : "invalid"}` : `${TEAM}?ok=1`);
}

/** A message to the whole team (no peer) or to one teammate. */
export async function sendTeamMessage(formData: FormData) {
  const peer = person(formData, "peer");
  const back = `/platform/messages?with=${peer ?? "team"}`;
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) redirect(back as "/platform/messages");
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("team_send", { p_peer: peer, p_body: body });
  if (error) redirect(`${back}&error=${errorCode(error)}` as "/platform/messages");
  revalidatePath("/platform", "layout");
  redirect(back as "/platform/messages");
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
