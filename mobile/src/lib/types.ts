export type Component = 'cc' | 'tp' | 'exam' | 'resit' | 'other';

export type Course = {
  id: string;
  code: string;
  title: string;
  description: string;
  level: string | null;
  color: string;
};

export type Assignment = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_at: string | null;
  points_possible: number;
  weight: number;
  component: Component;
  submission_types: string[];
};

export type Submission = {
  id: string;
  assignment_id: string;
  body: string | null;
  file_path: string | null;
  file_name: string | null;
  submitted_at: string;
};

export type Grade = {
  assignment_id: string;
  student_id: string;
  score: number | null;
  comment: string | null;
};

export type ModuleRow = { id: string; title: string; position: number };

export type ModuleItem = {
  id: string;
  module_id: string;
  item_type: 'page' | 'assignment' | 'link' | 'header';
  title: string;
  page_id: string | null;
  assignment_id: string | null;
  url: string | null;
  position: number;
};

export type Announcement = { id: string; title: string; body: string; created_at: string };

/** Weighted average on 20 over graded work only (same rule as the web app). */
export function weightedAverage(assignments: Assignment[], grades: Grade[], studentId: string): number | null {
  let total = 0;
  let weights = 0;
  for (const a of assignments) {
    const g = grades.find((row) => row.assignment_id === a.id && row.student_id === studentId);
    if (!g || g.score === null) continue;
    const w = Number(a.weight);
    if (w <= 0 || Number(a.points_possible) <= 0) continue;
    total += (Number(g.score) / Number(a.points_possible)) * 20 * w;
    weights += w;
  }
  return weights === 0 ? null : Math.round((total / weights) * 100) / 100;
}

export function isPast(iso: string | null | undefined) {
  return !!iso && new Date(iso).getTime() < Date.now();
}

export type QuestionType = 'single' | 'multiple' | 'true_false' | 'short' | 'numeric' | 'essay';
export type QuestionOption = { id: string; text: string };

export type Quiz = {
  id: string;
  assignment_id: string;
  time_limit_minutes: number | null;
  attempts_allowed: number;
  show_results: 'never' | 'after_submit' | 'after_due';
};

export type QuizAttempt = {
  id: string;
  attempt_no: number;
  option_orders: Record<string, string[]>;
  answers: Record<string, unknown>;
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  needs_review: boolean;
};

export type AttemptReview = {
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  needs_review: boolean;
  show_keys: boolean;
  questions: {
    id: string;
    qtype: QuestionType;
    prompt: string;
    options: QuestionOption[];
    points: number;
    answer: unknown;
    earned: number | null;
    correct: unknown;
    explanation: string | null;
  }[];
};

export type UEResult = {
  ue_id: string;
  code: string;
  title: string;
  credits: number;
  final: number | null;
  status: 'validated' | 'compensated' | 'failed' | 'incomplete';
};

export type Decision = 'admitted' | 'admitted_compensation' | 'resit' | 'incomplete';
