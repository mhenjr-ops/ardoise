"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function signIn(formData: FormData) {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=invalid");
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  const fullName = text(formData, "full_name");
  if (password.length < 8) redirect("/login?mode=signup&error=weak");

  const origin = (await headers()).get("origin") ?? "";
  const locale = await getLocale();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, locale },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) redirect(`/login?mode=signup&error=generic`);
  // With email confirmation off (local dev), the user is signed in already.
  if (data.session) redirect("/dashboard");
  redirect("/login?ok=check");
}

export async function demoSignIn(formData: FormData) {
  const { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_PASSWORD } = await import("@/lib/demo");
  const role = String(formData.get("role") ?? "") as keyof typeof DEMO_ACCOUNTS;
  if (!DEMO_ENABLED || !(role in DEMO_ACCOUNTS)) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_ACCOUNTS[role], password: DEMO_PASSWORD });
  if (error) redirect("/login?error=demo");
  redirect("/dashboard");
}
