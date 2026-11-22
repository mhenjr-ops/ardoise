import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishJoining } from "@/lib/joining";

/**
 * Landing point for the email-confirmation link (PKCE code exchange).
 * Accepts the invitation or links the matricule the account was created for,
 * so confirming the email lands people straight in their school.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const target = data.user ? await finishJoining(supabase, data.user) : null;
      return NextResponse.redirect(`${origin}${target ?? next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=generic`);
}
