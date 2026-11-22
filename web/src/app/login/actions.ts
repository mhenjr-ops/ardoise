"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { finishJoining, isInviteToken } from "@/lib/joining";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** Only same-site paths are allowed as a destination after signing in. */
function safeNext(value: FormDataEntryValue | null): string {
  const s = String(value ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/dashboard";
}

function back(path: string, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `${path}?${q.toString()}`;
}

/** Email or matricule + password. A matricule is exchanged for the account's email only
 *  when the password is right (see login_email in the database). */
export async function signIn(formData: FormData) {
  const identifier = text(formData, "identifier");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const failed = (error: string): never => redirect(back("/login", { error, ...(next !== "/dashboard" ? { next } : {}) }));
  if (!identifier || !password) failed("invalid");

  const supabase = await createClient();
  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await supabase.rpc("login_email", { p_matricule: identifier, p_password: password });
    if (error) failed(error.message.includes("too_many_attempts") ? "too_many" : "invalid");
    if (!data) failed("invalid");
    email = data as string;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) failed("invalid");
  redirect(next);
}

/** Students sign up with their university (picked from the list or set by the school's
 *  link) and matricule; invited staff (coming from a /join invitation) only need a name,
 *  email and password. What the account is for is saved on it, so it is finished after
 *  the confirmation email whatever address the email link comes back to. */
export async function signUp(formData: FormData) {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  const fullName = text(formData, "full_name");
  const school = text(formData, "school").toLowerCase().slice(0, 60);
  const fromLink = formData.get("from_link") === "1";
  const matricule = text(formData, "matricule").toUpperCase().slice(0, 40);
  const next = safeNext(formData.get("next"));
  const invite = next.startsWith("/join/") ? next.slice("/join/".length) : "";
  const again = (error: string): never =>
    redirect(
      back("/login", {
        mode: "signup",
        error,
        ...(next !== "/dashboard" ? { next } : {}),
        ...(school ? (fromLink ? { school } : { pick: school }) : {}),
      }),
    );
  if (password.length < 8) again("weak");
  if (!email || fullName.length < 2) again("invalid");
  if (invite ? !isInviteToken(invite) : !school || matricule.length < 2) again("invalid");

  const origin = (await headers()).get("origin") ?? "";
  const locale = await getLocale();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, locale, ...(invite ? { invite } : { school_code: school, matricule }) },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) again(error.message.toLowerCase().includes("already") ? "exists" : "generic");
  if (!data.session || !data.user) redirect(back("/login", { ok: invite ? "check_invite" : "check" }));
  redirect((await finishJoining(supabase, data.user)) ?? "/dashboard");
}

export async function demoSignIn(formData: FormData) {
  const { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_PASSWORD } = await import("@/lib/demo");
  const role = String(formData.get("role") ?? "") as keyof typeof DEMO_ACCOUNTS;
  if (!DEMO_ENABLED || !(role in DEMO_ACCOUNTS)) redirect("/demo");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_ACCOUNTS[role], password: DEMO_PASSWORD });
  if (error) redirect("/demo?error=1");
  redirect("/dashboard");
}
