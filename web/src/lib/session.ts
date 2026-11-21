import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Course, Institution, InstitutionRole } from "@/lib/types";

type MembershipRow = {
  role: InstitutionRole;
  institution: Institution | Institution[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The signed-in user, their profile and their current institution. Redirects to /login if signed out. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, locale").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, institution:institutions(id, name, slug, default_locale, grading_system)")
      .eq("user_id", user.id),
  ]);

  const rows = (memberships ?? []) as MembershipRow[];
  // Sprint 1: one current institution (the first). A switcher comes later.
  const institution = rows.map((m) => one(m.institution)).find(Boolean) ?? null;
  const roles = rows
    .filter((m) => institution && one(m.institution)?.id === institution.id)
    .map((m) => m.role);

  return {
    supabase,
    user,
    profile: (profile ?? { id: user.id, email: user.email ?? "", full_name: "", locale: "fr" }) as {
      id: string;
      email: string;
      full_name: string;
      locale: "fr" | "en";
    },
    institution,
    roles,
    isAdmin: roles.includes("admin"),
    isAdminOrRegistrar: roles.includes("admin") || roles.includes("registrar"),
  };
});

/** Same as getSession, but sends users with no institution to onboarding. */
export const requireInstitution = cache(async () => {
  const session = await getSession();
  if (!session.institution) redirect("/onboarding");
  return { ...session, institution: session.institution };
});

/** The course (RLS-checked) and whether the user can manage it. 404s if not visible. */
export const getCourseContext = cache(async (courseId: string) => {
  const session = await getSession();
  const { data: course } = await session.supabase
    .from("courses")
    .select("id, institution_id, code, title, description, language, level, color, published")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) notFound();

  const [{ data: isStaff }, { data: role }] = await Promise.all([
    session.supabase.rpc("is_course_staff", { course: courseId }),
    session.supabase.rpc("course_role", { course: courseId }),
  ]);

  return {
    ...session,
    course: course as Course,
    isStaff: isStaff === true,
    courseRole: (role as string | null) ?? null,
  };
});

/** For server actions: a client plus the signed-in user, or a redirect to /login. */
export async function actionSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
