import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishJoining } from "@/lib/joining";
import { signInTarget } from "@/lib/auth-flow";

const TYPES: EmailOtpType[] = ["email", "signup", "recovery", "email_change", "invite", "magiclink"];

/**
 * Where links from Ardoise's own email templates land (supabase/templates): the token is
 * checked here, so the link works on any device, not only the browser that asked for it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash") ?? "";
  const type = searchParams.get("type") as EmailOtpType | null;
  const go = (path: string) => NextResponse.redirect(`${origin}${path}`);
  if (!tokenHash || !type || !TYPES.includes(type)) return go("/login?error=link_expired");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return go("/login?error=link_expired");

  if (type === "recovery") return go(await signInTarget(supabase, "/login/reset"));
  const joined = data.user ? await finishJoining(supabase, data.user) : null;
  return go(await signInTarget(supabase, joined ?? "/dashboard"));
}
