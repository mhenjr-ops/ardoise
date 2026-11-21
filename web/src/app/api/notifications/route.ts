import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Latest notifications and the unread count for the signed-in user. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [], unread: 0 }, { status: 401 });
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, data, link, course_id, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  return NextResponse.json({ items: data ?? [], unread: count ?? 0 });
}

/** Marks one notification ({ id }) or all of them ({ all: true }) as read. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: number; all?: boolean };
  let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (!body.all) {
    if (typeof body.id !== "number") return NextResponse.json({ ok: false }, { status: 400 });
    query = query.eq("id", body.id);
  }
  const { error } = await query;
  return NextResponse.json({ ok: !error });
}
