export type GradableAssignment = {
  id: string;
  points_possible: number;
  weight: number;
};

export type GradeRow = {
  assignment_id: string;
  student_id: string;
  score: number | null;
};

/** Scales a raw score to the /20 scale used in the LMD system. */
export function toTwenty(score: number, pointsPossible: number): number {
  if (pointsPossible <= 0) return 0;
  return (score / pointsPossible) * 20;
}

/**
 * Weighted average on 20 across the graded assignments only.
 * Returns null when nothing is graded yet.
 */
export function weightedAverage(
  assignments: GradableAssignment[],
  grades: GradeRow[],
  studentId: string,
): number | null {
  let total = 0;
  let weights = 0;
  for (const a of assignments) {
    const g = grades.find((row) => row.assignment_id === a.id && row.student_id === studentId);
    if (!g || g.score === null || g.score === undefined) continue;
    const w = Number(a.weight);
    if (w <= 0) continue;
    total += toTwenty(Number(g.score), Number(a.points_possible)) * w;
    weights += w;
  }
  if (weights === 0) return null;
  return Math.round((total / weights) * 100) / 100;
}
