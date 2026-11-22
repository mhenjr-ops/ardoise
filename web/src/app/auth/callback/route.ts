import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the email-confirmation link (PKCE code exchange).
 * A student who signed up with a school code and matricule is linked here,
 * so confirming the email lands them straight in their courses.
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
      const meta = data.user?.user_metadata ?? {};
      const school = typeof meta.school_code === "string" ? meta.school_code.trim().toLowerCase() : "";
      const matricule = typeof meta.matricule === "string" ? meta.matricule.trim().toUpperCase() : "";
      if (next === "/onboarding" && school && matricule) {
        const { data: claim } = await supabase.rpc("claim_matricule", {
          p_school: school,
          p_matricule: matricule,
          p_full_name: typeof meta.full_name === "string" ? meta.full_name : "",
        });
        const status = (claim as { status?: string } | null)?.status ?? "generic";
        if (status === "linked") return NextResponse.redirect(`${origin}/dashboard`);
        const query = new URLSearchParams({ claim: status, school, matricule });
        return NextResponse.redirect(`${origin}/onboarding?${query}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=generic`);
}
