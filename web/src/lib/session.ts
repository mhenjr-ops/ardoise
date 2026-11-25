import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Course, Institution, InstitutionRole } from "@/lib/types";

type MembershipRow = {
  id: string;
  role: InstitutionRole;
  faculty_id: string | null;
  department_id: string | null;
  institution: Institution | Institution[] | null;
};

export type Membership = { id: string; role: InstitutionRole; faculty_id: string | null; department_id: string | null };

/** What the signed-in user may do in their school, derived from their roles. */
export function capabilities(roles: InstitutionRole[]) {
  const has = (...r: InstitutionRole[]) => roles.includes("owner") || r.some((x) => roles.includes(x));
  return {
    isOwner: roles.includes("owner"),
    /** Settings, structure, staff and courses. */
    manageSchool: has("admin"),
    /** Student list, accounts to check, programme registration. */
    manageStudents: has("admin", "registrar"),
    /** Deliberations, grading rules, transcripts. */
    runResults: has("registrar"),
    /** Read results and deliberations. */
    readResults: has("admin", "registrar", "dean"),
    /** Can invite at least one kind of staff. */
    inviteStaff: has("admin", "dean", "hod"),
    /** Oversees a faculty or department. */
    oversees: roles.includes("dean") || roles.includes("hod"),
    /** Institution-wide calendar events. */
    schoolCalendar: has("admin", "registrar"),
    /** Anything in the Admin area. */
    adminArea: has("admin", "registrar", "dean", "hod"),
    isStaff: roles.some((r) => r !== "student"),
  };
}

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

  const [{ data: status }, { data: profile }, { data: memberships }] = await Promise.all([
    supabase.rpc("account_status"),
    supabase.from("profiles").select("id, email, full_name, locale").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role, faculty_id, department_id, institution:institutions(id, name, slug, default_locale, grading_system)")
      .eq("user_id", user.id),
  ]);
  // Two-step login: the code first if it is on; set it up first if this account must have it.
  // (The database enforces both; this sends people where they can fix it.)
  const security = status as { aal?: string; has_mfa?: boolean; mfa_required?: boolean } | null;
  if (security?.has_mfa && security.aal !== "aal2") redirect("/login/verify");
  if (security?.mfa_required && !security.has_mfa) redirect("/security");
  const { data: platform } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

  // The Ardoise team account is the master view of every university, never a member of one.
  const rows = platform ? [] : ((memberships ?? []) as MembershipRow[]);
  // Sprint 1: one current institution (the first). A switcher comes later.
  const institution = rows.map((m) => one(m.institution)).find(Boolean) ?? null;
  const mine = rows.filter((m) => institution && one(m.institution)?.id === institution.id);
  const roles = [...new Set(mine.map((m) => m.role))];
  const myMemberships: Membership[] = mine.map((m) => ({
    id: m.id,
    role: m.role,
    faculty_id: m.faculty_id,
    department_id: m.department_id,
  }));
  const can = capabilities(roles);

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
    memberships: myMemberships,
    can,
    isPlatformAdmin: !!platform,
    isAdmin: can.manageSchool,
    isAdminOrRegistrar: can.manageStudents,
  };
});

/** Same as getSession, but sends users with no institution to onboarding. */
export const requireInstitution = cache(async () => {
  const session = await getSession();
  if (session.isPlatformAdmin) redirect("/platform");
  if (!session.institution) redirect("/onboarding");
  return { ...session, institution: session.institution };
});

/** The course (RLS-checked) and whether the user can manage it. 404s if not visible. */
export const getCourseContext = cache(async (courseId: string) => {
  const session = await getSession();
  const { data: course } = await session.supabase
    .from("courses")
    .select("id, institution_id, department_id, code, title, description, language, level, color, published")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) notFound();

  const [{ data: isStaff }, { data: role }, { data: oversees }, { data: staffs }] = await Promise.all([
    session.supabase.rpc("is_course_staff", { course: courseId }),
    session.supabase.rpc("course_role", { course: courseId }),
    session.supabase.rpc("can_oversee_course", { course: courseId }),
    session.supabase.rpc("can_staff_course", { course: courseId }),
  ]);
  const staff = isStaff === true;
  const overseer = !staff && oversees === true && role === null;
  // The most senior role that gives read access, for the "viewing as" notice.
  const overseerRole: InstitutionRole | null = overseer
    ? ((["admin", "registrar", "dean", "hod"] as InstitutionRole[]).find((r) => session.roles.includes(r)) ?? "admin")
    : null;

  return {
    ...session,
    course: course as Course,
    isStaff: staff,
    /** Admin, registrar, dean or head of department reading a course they don't teach. */
    isOverseer: overseer,
    overseerRole,
    /** Can see the staff views (gradebook, people, attendance, dashboard). */
    canSeeStaffViews: staff || overseer,
    /** Can assign teachers and students (admin, registrar, dean, head of department). */
    canStaff: staffs === true,
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
