import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishJoining } from "@/lib/joining";
import { safePath, sessionMethods, signInTarget } from "@/lib/auth-flow";

/**
 * Where links from Supabase Auth land with a code (PKCE): the confirmation email, the
 * password-reset email and Google sign-in.
 * - A reset link goes to "choose a new password".
 * - A confirmation finishes joining (the invitation or matricule saved on the account).
 * - Then the two-step code if the account has it on, and any invitation it came from.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const go = (path: string) => {
    const res = NextResponse.redirect(`${origin}${path}`);
    res.cookies.delete("ardoise_next");
    return res;
  };
  // An expired or already-used email link comes back with an error instead of a code.
  if (searchParams.get("error_code") || searchParams.get("error")) {
    const expired = /otp_expired|expired|invalid/i.test(`${searchParams.get("error_code")} ${searchParams.get("error_description")}`);
    return go(`/login?error=${expired ? "link_expired" : "generic"}`);
  }
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next") ?? request.cookies.get("ardoise_next")?.value);
  if (!code) return go("/login?error=link_expired");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go("/login?error=link_expired");

  if (sessionMethods(data.session?.access_token).includes("recovery")) {
    return go(await signInTarget(supabase, "/login/reset"));
  }
  const joined = data.user ? await finishJoining(supabase, data.user) : null;
  return go(await signInTarget(supabase, joined ?? next));
}
