import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const INVITE_ERRORS = ["invitation_invalid", "invitation_used", "invitation_expired", "invitation_wrong_email"];
const TOKEN = /^[a-f0-9]{64}$/;

/** A /join/... value is an invitation when it is a 64-character token; otherwise it names a school. */
export const isInviteToken = (value: string) => TOKEN.test(value);

/**
 * Finishes what the account was created for, once the person is signed in:
 * an invitation (staff) or a school + matricule (students), both saved on the
 * account at sign-up. It runs after the confirmation email and again on the
 * "join your university" page, so it never depends on the email link keeping
 * its address intact. Returns where to send the person, or null if there is
 * nothing left to do.
 */
export async function finishJoining(supabase: SupabaseClient, user: User): Promise<string | null> {
  const meta = user.user_metadata ?? {};
  const invite = typeof meta.invite === "string" && isInviteToken(meta.invite) ? meta.invite : "";
  const school = typeof meta.school_code === "string" ? meta.school_code.trim().toLowerCase() : "";
  const matricule = typeof meta.matricule === "string" ? meta.matricule.trim().toUpperCase() : "";
  // Only ever tried once: after that the person uses the forms (or the invitation link) themselves.
  if (meta.join_tried || (!invite && !(school && matricule))) return null;

  const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) return null;
  await supabase.auth.updateUser({ data: { join_tried: true } });

  if (invite) {
    const { error } = await supabase.rpc("accept_invitation", { p_token: invite });
    if (!error) return "/dashboard";
    const code = INVITE_ERRORS.find((k) => error.message.includes(k)) ?? "generic";
    return `/join/${invite}?error=${code}`;
  }

  const { data } = await supabase.rpc("claim_matricule", {
    p_school: school,
    p_matricule: matricule,
    p_full_name: typeof meta.full_name === "string" ? meta.full_name : "",
  });
  const status = (data as { status?: string } | null)?.status ?? "generic";
  if (status === "linked") return "/dashboard";
  return `/onboarding?${new URLSearchParams({ claim: status, school, matricule })}`;
}

export type School = { slug: string; name: string };

/** Every school on Ardoise, by name (public: students pick theirs when signing up). */
export async function schoolDirectory(supabase: SupabaseClient): Promise<School[]> {
  const { data } = await supabase.rpc("school_directory");
  return (data ?? []) as School[];
}
