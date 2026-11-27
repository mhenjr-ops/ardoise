import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/verify", "/app", "/api/demo-session", "/join", "/request-demo", "/demo", "/review", "/app-check", "/api/transcripts"];

/** Refreshes the Supabase session cookie and sends signed-out visitors to /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // An email link that came back to the home page instead of the auth routes.
  const sp = request.nextUrl.searchParams;
  if (path === "/" && (sp.has("code") || sp.has("error_code") || sp.has("token_hash"))) {
    const url = request.nextUrl.clone();
    url.pathname = sp.has("token_hash") ? "/auth/confirm" : "/auth/callback";
    return NextResponse.redirect(url);
  }
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const next = request.nextUrl.searchParams.get("next") ?? "";
    const url = request.nextUrl.clone();
    url.pathname = next.startsWith("/") && !next.startsWith("//") ? next.split("?")[0] : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
