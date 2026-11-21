import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseKey, supabaseUrl } from "@/lib/env";
import { DEMO_ACCOUNTS, DEMO_ENABLED, DEMO_PASSWORD, type DemoRole } from "@/lib/demo";

/**
 * One-tap demo sign-in for the phone app: returns a session for a demo account
 * so the password never ships inside the app. Off unless DEMO_LOGINS=on.
 */
export async function POST(request: Request) {
  if (!DEMO_ENABLED) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role as DemoRole | undefined;
  if (!role || !(role in DEMO_ACCOUNTS)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = createClient(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: DEMO_ACCOUNTS[role], password: DEMO_PASSWORD });
  if (error || !data.session) return NextResponse.json({ error: "failed" }, { status: 502 });
  return NextResponse.json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
