import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type SearchHit = {
  kind: "course" | "assignment" | "page" | "person" | "university";
  id: string;
  title: string;
  sub: string;
  href: string;
};

/** Search across what the signed-in user can see (row-level security does the scoping). */
export async function GET(request: NextRequest) {
  // Keep only characters that are safe inside a PostgREST filter.
  const q = (request.nextUrl.searchParams.get("q") ?? "")
    .replace(/[,()"':\\%_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });

  const like = `*${q}*`;
  const [courses, assignments, pages, people, { data: isTeam }] = await Promise.all([
    supabase.from("courses").select("id, code, title").or(`title.ilike.${like},code.ilike.${like}`).limit(5),
    supabase.from("assignments").select("id, course_id, title, course:courses(code)").ilike("title", like).limit(6),
    supabase.from("pages").select("id, course_id, title, course:courses(code)").ilike("title", like).limit(5),
    supabase.from("profiles").select("id, full_name, email").or(`full_name.ilike.${like},email.ilike.${like}`).limit(6),
    supabase.rpc("is_platform_admin"),
  ]);
  // The Ardoise team finds any university by name, link name, short name or city.
  const universities = isTeam
    ? (
        await supabase
          .from("institutions")
          .select("id, name, slug, short_name, city, status")
          .or(`name.ilike.${like},slug.ilike.${like},short_name.ilike.${like},city.ilike.${like}`)
          .order("name")
          .limit(6)
      ).data ?? []
    : [];

  const code = (c: unknown) => (Array.isArray(c) ? c[0]?.code : (c as { code?: string } | null)?.code) ?? "";
  const hits: SearchHit[] = [
    ...universities.map((u) => ({
      kind: "university" as const,
      id: u.id,
      title: u.name,
      sub: [u.short_name, u.city].filter(Boolean).join(" · ") || `/join/${u.slug}`,
      href: `/platform/${u.slug}`,
    })),
    ...(courses.data ?? []).map((c) => ({ kind: "course" as const, id: c.id, title: c.title, sub: c.code, href: `/courses/${c.id}` })),
    ...(assignments.data ?? []).map((a) => ({
      kind: "assignment" as const,
      id: a.id,
      title: a.title,
      sub: code(a.course),
      href: `/courses/${a.course_id}/assignments/${a.id}`,
    })),
    ...(pages.data ?? []).map((p) => ({
      kind: "page" as const,
      id: p.id,
      title: p.title,
      sub: code(p.course),
      href: `/courses/${p.course_id}/pages/${p.id}`,
    })),
    ...(people.data ?? [])
      .filter((p) => p.id !== user.id)
      .map((p) => ({
        kind: "person" as const,
        id: p.id,
        title: p.full_name || p.email,
        sub: p.email,
        href: `/inbox/new?to=${p.id}`,
      })),
  ];
  return NextResponse.json({ hits });
}
