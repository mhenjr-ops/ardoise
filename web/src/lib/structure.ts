import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Unit = { id: string; name: string; code: string | null; kind: "faculty" | "school" };
export type Department = { id: string; name: string; code: string | null; faculty_id: string | null };
export type Programme = { id: string; name: string; code: string | null; department_id: string | null; cycle: string };
export type Year = { id: string; label: string; is_current: boolean; starts_on: string | null; ends_on: string | null };
export type Semester = { id: string; label: string; academic_year_id: string; starts_on: string | null; ends_on: string | null };
export type TeachingUnit = {
  id: string;
  code: string;
  title: string;
  credits: number;
  level: string | null;
  programme_id: string | null;
  semester_id: string | null;
};

export type Structure = {
  units: Unit[];
  departments: Department[];
  programmes: Programme[];
  years: Year[];
  semesters: Semester[];
  ues: TeachingUnit[];
};

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** A school's structure: faculties and schools, departments, programmes, years, semesters, UEs. */
export async function loadStructure(supabase: SupabaseClient, institutionId: string): Promise<Structure> {
  const [fac, dep, prog, years, sems, ues] = await Promise.all([
    supabase.from("faculties").select("id, name, code, kind").eq("institution_id", institutionId),
    supabase.from("departments").select("id, name, code, faculty_id").eq("institution_id", institutionId),
    supabase.from("programmes").select("id, name, code, department_id, cycle").eq("institution_id", institutionId),
    supabase
      .from("academic_years")
      .select("id, label, is_current, starts_on, ends_on")
      .eq("institution_id", institutionId)
      .order("label", { ascending: false }),
    supabase
      .from("semesters")
      .select("id, label, academic_year_id, starts_on, ends_on")
      .eq("institution_id", institutionId)
      .order("starts_on", { nullsFirst: false })
      .order("label"),
    supabase
      .from("teaching_units")
      .select("id, code, title, credits, level, programme_id, semester_id")
      .eq("institution_id", institutionId)
      .order("code"),
  ]);
  return {
    units: ((fac.data ?? []) as Unit[]).sort(byName),
    departments: ((dep.data ?? []) as Department[]).sort(byName),
    programmes: ((prog.data ?? []) as Programme[]).sort(byName),
    years: (years.data ?? []) as Year[],
    semesters: (sems.data ?? []) as Semester[],
    ues: (ues.data ?? []) as TeachingUnit[],
  };
}
