import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeStudent,
  toPolicy,
  type Decision,
  type EngineAssignment,
  type EngineCourse,
  type EngineUE,
  type UEResult,
} from "@/lib/lmd";

/** One semester of a draft transcript: the jury's published result, or what the marks add up to so far. */
export type DraftSemester = {
  label: string;
  official: boolean;
  published_at: string | null;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
};

export type DraftTranscript = {
  institution: string;
  student_name: string;
  student_email: string;
  matricule: string | null;
  programme: string;
  programme_code: string | null;
  level: string;
  academic_year: string;
  semesters: DraftSemester[];
};

type Raw = {
  institution: { name: string; short_name: string | null } | null;
  student: { full_name: string | null; email: string | null; matricule: string | null } | null;
  programme: { name: string; code: string | null } | null;
  level: string;
  academic_year: string;
  policy: Record<string, unknown> | null;
  semesters: Array<{
    id: string;
    label: string;
    published: {
      ue_results: UEResult[];
      semester_average: number | string | null;
      credits_earned: number;
      credits_total: number;
      decision: Decision;
      published_at: string | null;
    } | null;
    ues: EngineUE[];
    courses: Array<Omit<EngineCourse, "coefficient"> & { coefficient: number | string }>;
    assignments: Array<Omit<EngineAssignment, "weight" | "points_possible"> & { weight: number | string; points_possible: number | string }>;
    grades: Array<{ assignment_id: string; score: number | string | null }>;
  }>;
};

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/**
 * The signed-in student's draft transcript, computed with the same engine as the jury's
 * deliberation (no unpublished jury bonuses). Null when they aren't registered in a programme.
 */
export async function loadDraftTranscript(supabase: SupabaseClient, userId: string): Promise<DraftTranscript | null> {
  const { data, error } = await supabase.rpc("draft_transcript_data");
  if (error) throw new Error(error.message);
  const raw = data as Raw | null;
  if (!raw) return null;
  const policy = toPolicy(raw.policy);

  const semesters: DraftSemester[] = raw.semesters.map((s) => {
    if (s.published) {
      return {
        label: s.label,
        official: true,
        published_at: s.published.published_at,
        ue_results: s.published.ue_results,
        semester_average: num(s.published.semester_average),
        credits_earned: s.published.credits_earned,
        credits_total: s.published.credits_total,
        decision: s.published.decision,
      };
    }
    const r = computeStudent(
      {
        policy,
        ues: s.ues.map((u) => ({ ...u, credits: Number(u.credits) })),
        courses: s.courses.map((c) => ({ ...c, coefficient: Number(c.coefficient) })),
        assignments: s.assignments.map((a) => ({ ...a, weight: Number(a.weight), points_possible: Number(a.points_possible) })),
        grades: s.grades.map((g) => ({ assignment_id: g.assignment_id, student_id: userId, score: num(g.score) })),
        students: [userId],
        bonuses: [],
      },
      userId,
    );
    return {
      label: s.label,
      official: false,
      published_at: null,
      ue_results: r.ue_results,
      semester_average: r.semester_average,
      credits_earned: r.credits_earned,
      credits_total: r.credits_total,
      decision: r.decision,
    };
  });

  return {
    institution: raw.institution?.name ?? "",
    student_name: raw.student?.full_name || raw.student?.email || "",
    student_email: raw.student?.email ?? "",
    matricule: raw.student?.matricule ?? null,
    programme: raw.programme?.name ?? "",
    programme_code: raw.programme?.code ?? null,
    level: raw.level,
    academic_year: raw.academic_year,
    semesters,
  };
}
