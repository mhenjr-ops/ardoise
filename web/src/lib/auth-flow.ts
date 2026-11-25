import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptAnyInvitation, isInviteToken } from "@/lib/joining";
import { supabaseKey, supabaseUrl } from "@/lib/env";

/** Only same-site paths are allowed as a destination after signing in. */
export function safePath(value: unknown, fallback = "/dashboard"): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}

/** True when the account has two-step login on and this session hasn't entered the code yet. */
export async function needsCode(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/**
 * Where a fresh sign-in goes: the two-step code first if the account has it on, then the
 * invitation it came from (accepted on the spot), then wherever the person was going.
 */
export async function signInTarget(supabase: SupabaseClient, next: string): Promise<string> {
  if (await needsCode(supabase)) return `/login/verify?next=${encodeURIComponent(next)}`;
  const token = next.startsWith("/join/") ? next.slice("/join/".length) : "";
  if (isInviteToken(token)) {
    const result = await acceptAnyInvitation(supabase, token);
    return "to" in result ? result.to : `/join/${token}?error=${result.error}`;
  }
  return next;
}

/** The authentication methods recorded in the session's access token ("password", "recovery", "oauth"…). */
export function sessionMethods(accessToken: string | undefined): string[] {
  try {
    const payload = JSON.parse(Buffer.from((accessToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as {
      amr?: Array<{ method?: string }>;
    };
    return (payload.amr ?? []).map((a) => a.method ?? "");
  } catch {
    return [];
  }
}

/** Whether "Continue with Google" is switched on for this project (checked every 5 minutes). */
export async function googleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: supabaseKey() },
      next: { revalidate: 300 },
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

/** Error codes from Supabase Auth that the sign-in pages explain in their own words. */
export function authErrorCode(error: { code?: string; message?: string; status?: number } | null): string {
  if (!error) return "generic";
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit") || error.status === 429) {
    return "email_limit";
  }
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "unconfirmed";
  if (code === "weak_password") return "weak";
  if (code === "same_password") return "same_password";
  return "generic";
}
