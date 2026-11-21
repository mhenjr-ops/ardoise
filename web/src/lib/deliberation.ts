import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { chunk, fetchAll } from "@/lib/fetch-all";
import {
  computeDeliberation,
  toPolicy,
  type EngineAssignment,
  type EngineCourse,
  type EngineGrade,
  type EngineUE,
  type JuryBonus,
} from "@/lib/lmd";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type DeliberationRow = {
  id: string;
  institution_id: string;
  programme_id: string;
  semester_id: string;
  level: string;
  status: "draft" | "locked" | "published";
  computed_at: string | null;
  published_at: string | null;
  locked_at: string | null;
  policy: Record<string, unknown> | null;
  programme: { name: string; code: string | null } | { name: string; code: string | null }[] | null;
  semester:
    | { label: string; academic_year_id: string; academic_year: { label: string } | { label: string }[] | null }
    | { label: string; academic_year_id: string; academic_year: { label: string } | { label: string }[] | null }[]
    | null;
};

export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function loadDeliberation(supabase: Supabase, id: string) {
  const { data } = await supabase
    .from("deliberations")
    .select(
      "id, institution_id, programme_id, semester_id, level, status, computed_at, published_at, locked_at, policy, programme:programmes(name, code), semester:semesters(label, academic_year_id, academic_year:academic_years(label))",
    )
    .eq("id", id)
    .maybeSingle();
  return data as DeliberationRow | null;
}

/** The teaching units a deliberation covers: same programme and semester, same level (or no level set). */
export async function loadUEs(supabase: Supabase, d: Pick<DeliberationRow, "programme_id" | "semester_id" | "level">) {
  const { data } = await supabase
    .from("teaching_units")
    .select("id, code, title, credits, level")
    .eq("programme_id", d.programme_id)
    .eq("semester_id", d.semester_id)
    .order("code");
  return ((data ?? []) as Array<EngineUE & { level: string | null }>).filter((u) => !u.level || u.level === d.level);
}

/**
 * Recomputes every registered student's results for a draft deliberation and
 * stores them. Uses the institution's current grading policy and the jury bonuses.
 */
export async function computeAndStore(supabase: Supabase, deliberationId: string): Promise<{ students: number; ues: number }> {
  const d = await loadDeliberation(supabase, deliberationId);
  if (!d) throw new Error("not_found");
  if (d.status !== "draft") throw new Error("deliberation_locked");
  const semester = one(d.semester);
  if (!semester) throw new Error("invalid");

  const [{ data: policyRow }, ues] = await Promise.all([
    supabase.from("grading_policies").select("*").eq("institution_id", d.institution_id).maybeSingle(),
    loadUEs(supabase, d),
  ]);
  const policy = toPolicy(policyRow);
  const ueIds = ues.map((u) => u.id);

  const courses: EngineCourse[] = ueIds.length
    ? ((
        await supabase
          .from("courses")
          .select("id, code, title, teaching_unit_id, coefficient, component_weights")
          .in("teaching_unit_id", ueIds)
      ).data ?? []).map((c) => ({ ...c, coefficient: Number(c.coefficient) }))
    : [];
  const courseIds = courses.map((c) => c.id);

  const assignments: EngineAssignment[] = courseIds.length
    ? ((
        await supabase
          .from("assignments")
          .select("id, course_id, component, weight, points_possible")
          .in("course_id", courseIds)
          .eq("published", true)
      ).data ?? []).map((a) => ({ ...a, weight: Number(a.weight), points_possible: Number(a.points_possible) }))
    : [];

  const grades: EngineGrade[] = [];
  for (const ids of chunk(assignments.map((a) => a.id))) {
    const rows = await fetchAll<EngineGrade>((from, to) =>
      supabase.from("grades").select("assignment_id, student_id, score").in("assignment_id", ids).range(from, to),
    );
    grades.push(...rows.map((g) => ({ ...g, score: g.score === null ? null : Number(g.score) })));
  }

  type EnrollmentRow = { student_id: string; student: { full_name: string; email: string } | { full_name: string; email: string }[] | null };
  const enrollments = await fetchAll<EnrollmentRow>((from, to) =>
    supabase
      .from("programme_enrollments")
      .select("student_id, student:profiles(full_name, email)")
      .eq("programme_id", d.programme_id)
      .eq("academic_year_id", semester.academic_year_id)
      .eq("level", d.level)
      .range(from, to),
  );

  const { data: bonusRows } = await supabase
    .from("jury_adjustments")
    .select("student_id, teaching_unit_id, bonus")
    .eq("deliberation_id", d.id);
  const bonuses = ((bonusRows ?? []) as JuryBonus[]).map((b) => ({ ...b, bonus: Number(b.bonus) }));

  const results = computeDeliberation({
    policy,
    ues: ues.map((u) => ({ id: u.id, code: u.code, title: u.title, credits: Number(u.credits) })),
    courses,
    assignments,
    grades,
    students: enrollments.map((e) => e.student_id),
    bonuses,
  });
  const names = new Map(
    enrollments.map((e) => {
      const p = one(e.student);
      return [e.student_id, p?.full_name || p?.email || ""];
    }),
  );

  const { error: deleteError } = await supabase.from("deliberation_results").delete().eq("deliberation_id", d.id);
  if (deleteError) throw new Error(deleteError.message);
  for (const part of chunk(results, 300)) {
    const { error } = await supabase.from("deliberation_results").insert(
      part.map((r) => ({
        deliberation_id: d.id,
        student_id: r.student_id,
        student_name: names.get(r.student_id) ?? "",
        ue_results: r.ue_results,
        semester_average: r.semester_average,
        credits_earned: r.credits_earned,
        credits_total: r.credits_total,
        decision: r.decision,
      })),
    );
    if (error) throw new Error(error.message);
  }
  await supabase.from("deliberations").update({ computed_at: new Date().toISOString(), policy }).eq("id", d.id);
  return { students: results.length, ues: ues.length };
}
