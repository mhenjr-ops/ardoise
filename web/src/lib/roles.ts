import type { Membership } from "@/lib/session";
import type { InstitutionRole } from "@/lib/types";

export const ROLE_ORDER: InstitutionRole[] = ["owner", "admin", "registrar", "dean", "hod", "teacher", "student"];

/** Mirrors can_grant_role in the database, to show only the choices that will work. */
export function canGrant(
  mine: Membership[],
  role: InstitutionRole,
  facultyId: string | null,
  departmentId: string | null,
  facultyOfDepartment: Map<string, string | null>,
): boolean {
  const has = (r: InstitutionRole) => mine.some((m) => m.role === r);
  const owner = has("owner");
  const admin = owner || has("admin");
  const managesDept = (dept: string | null) =>
    !!dept &&
    (owner ||
      mine.some((m) => m.role === "hod" && m.department_id === dept) ||
      mine.some((m) => m.role === "dean" && m.faculty_id !== null && m.faculty_id === facultyOfDepartment.get(dept)));
  switch (role) {
    case "owner":
    case "admin":
      return owner;
    case "registrar":
    case "dean":
      return admin;
    case "hod":
      return admin || mine.some((m) => m.role === "dean" && !!departmentId && m.faculty_id === facultyOfDepartment.get(departmentId));
    case "teacher":
      return admin || managesDept(departmentId);
    case "student":
      return admin || has("registrar");
  }
  void facultyId;
  return false;
}

/** Roles this person can hand out, for the invitation form. */
export function grantableRoles(mine: Membership[]): InstitutionRole[] {
  const has = (r: InstitutionRole) => mine.some((m) => m.role === r);
  if (has("owner")) return ["owner", "admin", "registrar", "dean", "hod", "teacher"];
  if (has("admin")) return ["registrar", "dean", "hod", "teacher"];
  if (has("dean")) return ["hod", "teacher"];
  if (has("hod")) return ["teacher"];
  return [];
}
