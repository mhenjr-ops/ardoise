/**
 * LMD results engine.
 *
 * mark per course  = weighted mix of components (CC, TP, exam), each the
 *                    weighted average of its assignments scaled to /20;
 *                    a graded resit replaces the exam (or the better of the
 *                    two, per policy)
 * mark per UE      = average of its courses weighted by coefficient,
 *                    plus any jury bonus (capped by policy)
 * semester average = average of UE marks weighted by credits
 * compensation     = when the semester average reaches the pass mark,
 *                    failed UEs at or above the elimination mark are validated
 *
 * Every threshold comes from the institution's grading policy.
 */

export type Component = "cc" | "tp" | "exam" | "resit" | "other";

export type Policy = {
  pass_mark: number;
  ue_compensation: boolean;
  elimination_mark: number;
  resit_rule: "replace" | "max";
  component_weights: Record<string, number>;
  jury_max_bonus: number;
};

export type EngineCourse = {
  id: string;
  code: string;
  title: string;
  teaching_unit_id: string | null;
  coefficient: number;
  component_weights: Record<string, number> | null;
};

export type EngineAssignment = {
  id: string;
  course_id: string;
  component: Component;
  weight: number;
  points_possible: number;
};

export type EngineUE = { id: string; code: string; title: string; credits: number };
export type EngineGrade = { assignment_id: string; student_id: string; score: number | null };
export type JuryBonus = { student_id: string; teaching_unit_id: string; bonus: number };

export type CourseResult = {
  course_id: string;
  code: string;
  title: string;
  coefficient: number;
  mark: number | null;
  components: { cc: number | null; tp: number | null; exam: number | null };
};

export type UEStatus = "validated" | "compensated" | "failed" | "incomplete";

export type UEResult = {
  ue_id: string;
  code: string;
  title: string;
  credits: number;
  mark: number | null;
  bonus: number;
  final: number | null;
  status: UEStatus;
  courses: CourseResult[];
};

export type Decision = "admitted" | "admitted_compensation" | "resit" | "incomplete";

export type StudentResult = {
  student_id: string;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
};

export const DEFAULT_POLICY: Policy = {
  pass_mark: 10,
  ue_compensation: true,
  elimination_mark: 0,
  resit_rule: "replace",
  component_weights: { cc: 30, tp: 20, exam: 50 },
  jury_max_bonus: 1,
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toTwenty(score: number, points: number): number {
  return points > 0 ? (score / points) * 20 : 0;
}

type Group = { avg: number; graded: boolean };

/** Weighted average (/20) of one component's assignments; a missing mark counts as 0. */
function groupAverage(assignments: EngineAssignment[], grades: Map<string, number | null>): Group | null {
  if (assignments.length === 0) return null;
  const allZero = assignments.every((a) => Number(a.weight) <= 0);
  let total = 0;
  let weights = 0;
  let graded = false;
  for (const a of assignments) {
    const w = allZero ? 1 : Math.max(0, Number(a.weight));
    if (w === 0) continue;
    const score = grades.get(a.id);
    if (score !== null && score !== undefined) graded = true;
    total += toTwenty(Number(score ?? 0), Number(a.points_possible)) * w;
    weights += w;
  }
  return weights === 0 ? null : { avg: total / weights, graded };
}

/** A student's mark (/20) in one course, or null when they have no mark at all (absent). */
export function courseMark(
  course: EngineCourse,
  assignments: EngineAssignment[],
  studentGrades: Map<string, number | null>,
  policy: Policy,
): CourseResult {
  const mine = assignments.filter((a) => a.course_id === course.id);
  const base: CourseResult = {
    course_id: course.id,
    code: course.code,
    title: course.title,
    coefficient: Number(course.coefficient) || 1,
    mark: null,
    components: { cc: null, tp: null, exam: null },
  };
  const anyGrade = mine.some((a) => {
    const s = studentGrades.get(a.id);
    return s !== null && s !== undefined;
  });
  if (mine.length === 0 || !anyGrade) return base;

  const cc = groupAverage(mine.filter((a) => a.component === "cc" || a.component === "other"), studentGrades);
  const tp = groupAverage(mine.filter((a) => a.component === "tp"), studentGrades);
  const examGroup = groupAverage(mine.filter((a) => a.component === "exam"), studentGrades);
  const resit = groupAverage(mine.filter((a) => a.component === "resit"), studentGrades);

  let exam: number | null = examGroup ? examGroup.avg : null;
  if (resit && resit.graded) {
    exam = policy.resit_rule === "max" && exam !== null ? Math.max(exam, resit.avg) : resit.avg;
  }

  const weights = course.component_weights ?? policy.component_weights;
  const parts: Array<[number, number]> = [];
  if (cc) parts.push([cc.avg, Number(weights.cc ?? 0)]);
  if (tp) parts.push([tp.avg, Number(weights.tp ?? 0)]);
  if (exam !== null) parts.push([exam, Number(weights.exam ?? 0)]);

  let sumW = parts.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let mark: number;
  if (sumW > 0) {
    mark = parts.reduce((s, [v, w]) => s + v * Math.max(0, w), 0) / sumW;
  } else {
    sumW = parts.length;
    mark = parts.reduce((s, [v]) => s + v, 0) / sumW;
  }

  return {
    ...base,
    mark: round2(mark),
    components: {
      cc: cc ? round2(cc.avg) : null,
      tp: tp ? round2(tp.avg) : null,
      exam: exam !== null ? round2(exam) : null,
    },
  };
}

export type DeliberationInput = {
  policy: Policy;
  ues: EngineUE[];
  courses: EngineCourse[];
  assignments: EngineAssignment[];
  grades: EngineGrade[];
  students: string[];
  bonuses: JuryBonus[];
};

export function computeStudent(input: DeliberationInput, studentId: string): StudentResult {
  const { policy } = input;
  const studentGrades = new Map<string, number | null>();
  for (const g of input.grades) {
    if (g.student_id === studentId) studentGrades.set(g.assignment_id, g.score === null ? null : Number(g.score));
  }

  const ueResults: UEResult[] = input.ues.map((ue) => {
    const courses = input.courses.filter((c) => c.teaching_unit_id === ue.id);
    const courseResults = courses.map((c) => courseMark(c, input.assignments, studentGrades, policy));
    let mark: number | null = null;
    if (courseResults.length > 0 && courseResults.every((c) => c.mark !== null)) {
      const coef = courseResults.reduce((s, c) => s + c.coefficient, 0);
      mark = round2(courseResults.reduce((s, c) => s + (c.mark as number) * c.coefficient, 0) / coef);
    }
    const rawBonus = input.bonuses
      .filter((b) => b.student_id === studentId && b.teaching_unit_id === ue.id)
      .reduce((s, b) => s + Number(b.bonus), 0);
    const bonus = round2(Math.min(rawBonus, policy.jury_max_bonus));
    const final = mark === null ? null : round2(Math.min(20, mark + bonus));
    const status: UEStatus = final === null ? "incomplete" : final >= policy.pass_mark ? "validated" : "failed";
    return {
      ue_id: ue.id,
      code: ue.code,
      title: ue.title,
      credits: Number(ue.credits),
      mark,
      bonus,
      final,
      status,
      courses: courseResults,
    };
  });

  const creditsTotal = ueResults.reduce((s, u) => s + u.credits, 0);
  let average: number | null = null;
  if (ueResults.length > 0 && ueResults.every((u) => u.final !== null)) {
    const sumCredits = ueResults.reduce((s, u) => s + u.credits, 0);
    average =
      sumCredits > 0
        ? round2(ueResults.reduce((s, u) => s + (u.final as number) * u.credits, 0) / sumCredits)
        : round2(ueResults.reduce((s, u) => s + (u.final as number), 0) / ueResults.length);
  }

  if (policy.ue_compensation && average !== null && average >= policy.pass_mark) {
    for (const u of ueResults) {
      if (u.status === "failed" && (u.final as number) >= policy.elimination_mark) u.status = "compensated";
    }
  }

  const creditsEarned = ueResults
    .filter((u) => u.status === "validated" || u.status === "compensated")
    .reduce((s, u) => s + u.credits, 0);

  let decision: Decision;
  if (ueResults.length === 0 || ueResults.some((u) => u.status === "incomplete")) decision = "incomplete";
  else if (ueResults.every((u) => u.status === "validated")) decision = "admitted";
  else if (ueResults.every((u) => u.status !== "failed")) decision = "admitted_compensation";
  else decision = "resit";

  return {
    student_id: studentId,
    ue_results: ueResults,
    semester_average: average,
    credits_earned: creditsEarned,
    credits_total: creditsTotal,
    decision,
  };
}

export function computeDeliberation(input: DeliberationInput): StudentResult[] {
  return input.students.map((s) => computeStudent(input, s));
}

/** Coerces a grading_policies row (numerics may arrive as strings) into a Policy. */
export function toPolicy(row: Partial<Record<keyof Policy, unknown>> | null | undefined): Policy {
  if (!row) return DEFAULT_POLICY;
  const weights =
    row.component_weights && typeof row.component_weights === "object"
      ? (row.component_weights as Record<string, number>)
      : DEFAULT_POLICY.component_weights;
  return {
    pass_mark: Number(row.pass_mark ?? DEFAULT_POLICY.pass_mark),
    ue_compensation: row.ue_compensation === undefined ? DEFAULT_POLICY.ue_compensation : Boolean(row.ue_compensation),
    elimination_mark: Number(row.elimination_mark ?? DEFAULT_POLICY.elimination_mark),
    resit_rule: row.resit_rule === "max" ? "max" : "replace",
    component_weights: weights,
    jury_max_bonus: Number(row.jury_max_bonus ?? DEFAULT_POLICY.jury_max_bonus),
  };
}
