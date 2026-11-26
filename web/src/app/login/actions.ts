"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { finishJoining, isInviteToken } from "@/lib/joining";
import { authErrorCode, needsCode, safePath, signInTarget } from "@/lib/auth-flow";
import { captchaToken } from "@/lib/bot-check";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function back(path: string, params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `${path}?${q.toString()}`;
}

async function origin() {
  return (await headers()).get("origin") ?? "";
}

/** Email or matricule + password. A matricule is exchanged for the account's email only
 *  when the password is right (see login_email in the database). */
export async function signIn(formData: FormData) {
  const identifier = text(formData, "identifier");
  const password = String(formData.get("password") ?? "");
  const next = safePath(formData.get("next"));
  const keepNext: Record<string, string> = next !== "/dashboard" ? { next } : {};
  const failed = (error: string, extra: Record<string, string> = {}): never =>
    redirect(back("/login", { error, ...keepNext, ...extra }));
  if (!identifier || !password) failed("invalid");

  const supabase = await createClient();
  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await supabase.rpc("login_email", { p_matricule: identifier, p_password: password });
    if (error) failed(error.message.includes("too_many_attempts") ? "too_many" : "invalid");
    if (!data) failed("invalid");
    email = data as string;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken(formData) } });
  if (error) {
    const code = authErrorCode(error);
    failed(code === "unconfirmed" || code === "captcha" ? code : "invalid", code === "unconfirmed" ? { email } : {});
  }
  // The two-step code if the account has it on, then the invitation it came from, if any.
  redirect(await signInTarget(supabase, next));
}

/** Google sign-in. Where the person was going is kept in a short-lived cookie, so it survives
 *  the trip to Google even if the return address is cut down to the home page. */
export async function signInWithGoogle(formData: FormData) {
  const next = safePath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect(back("/login", { error: "google" }));
  (await cookies()).set("ardoise_next", next, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/" });
  redirect(data.url);
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
  const next = safePath(formData.get("next"));
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

  const locale = await getLocale();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, locale, ...(invite ? { invite } : { school_code: school, matricule }) },
      emailRedirectTo: `${await origin()}/auth/callback`,
      captchaToken: captchaToken(formData),
    },
  });
  if (error) {
    const code = authErrorCode(error);
    again(
      code === "email_limit" || code === "weak" || code === "captcha"
        ? code
        : error.message.toLowerCase().includes("already")
          ? "exists"
          : "generic",
    );
  }
  // An email that already has an account comes back without an identity (and no email is
  // sent): send the person to sign in with it instead, keeping where they were going.
  if (data.user && (data.user.identities ?? []).length === 0) {
    redirect(back("/login", { error: "account_exists", email, ...(next !== "/dashboard" ? { next } : {}) }));
  }
  if (!data.session || !data.user) redirect(back("/login", { ok: invite ? "check_invite" : "check", email }));
  redirect((await finishJoining(supabase, data.user)) ?? "/dashboard");
}

/** Sends the confirmation email again (never says whether the address has an account). */
export async function resendConfirmation(formData: FormData) {
  const email = text(formData, "email").slice(0, 320);
  const next = safePath(formData.get("next"));
  const keepNext: Record<string, string> = next !== "/dashboard" ? { next } : {};
  if (!email.includes("@")) redirect(back("/login", { error: "invalid", ...keepNext }));
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback`, captchaToken: captchaToken(formData) },
  });
  const code = error ? authErrorCode(error) : "";
  if (code === "email_limit" || code === "captcha") redirect(back("/login", { error: code, email, ...keepNext }));
  redirect(back("/login", { ok: "resent", email, ...keepNext }));
}

/** Forgot password: a link to choose a new one (never says whether the address has an account). */
export async function requestReset(formData: FormData) {
  const email = text(formData, "email").slice(0, 320);
  if (!email.includes("@")) redirect(back("/login/forgot", { error: "invalid" }));
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback`,
    captchaToken: captchaToken(formData),
  });
  const code = error ? authErrorCode(error) : "";
  if (code === "email_limit" || code === "captcha") redirect(back("/login/forgot", { error: code, email }));
  redirect(back("/login/forgot", { sent: "1", email }));
}

/** New password, from the reset link (or from Security while signed in). Other devices are signed out. */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const from = formData.get("from") === "security" ? "/security" : "/login/reset";
  if (password.length < 8) redirect(back(from, { error: "weak" }));
  if (password !== confirm) redirect(back(from, { error: "mismatch" }));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(back("/login/forgot", { error: "link_expired" }));
  // With two-step login on, a reset link alone is not enough: the code comes first.
  if (await needsCode(supabase)) redirect(`/login/verify?next=${encodeURIComponent(from)}`);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = authErrorCode(error);
    redirect(back(from, { error: code === "same_password" || code === "weak" ? code : "generic" }));
  }
  await supabase.auth.signOut({ scope: "others" });
  redirect(back("/security", { ok: "password" }));
}

/** The 6-digit code from the authenticator app. */
export async function verifyCode(formData: FormData) {
  const code = text(formData, "code").replace(/\s/g, "");
  const next = safePath(formData.get("next"));
  const again = (error: string): never => redirect(back("/login/verify", { error, ...(next !== "/dashboard" ? { next } : {}) }));
  if (!/^\d{6}$/.test(code)) again("code");
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/login");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) again(authErrorCode(error) === "email_limit" ? "too_many" : "code");
  redirect(await signInTarget(supabase, next));
}

export async function demoSignIn(formData: FormData) {
  const { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_PASSWORD } = await import("@/lib/demo");
  const role = String(formData.get("role") ?? "") as keyof typeof DEMO_ACCOUNTS;
  if (!DEMO_ENABLED || !(role in DEMO_ACCOUNTS)) redirect("/demo");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_ACCOUNTS[role],
    password: DEMO_PASSWORD,
    options: { captchaToken: captchaToken(formData) },
  });
  if (error) redirect(`/demo?error=${authErrorCode(error) === "captcha" ? "captcha" : "1"}`);
  redirect("/dashboard");
}
