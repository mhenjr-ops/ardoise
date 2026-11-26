export type InstitutionRole = "owner" | "admin" | "registrar" | "dean" | "hod" | "teacher" | "student";
export const STAFF_ROLES = ["owner", "admin", "registrar", "dean", "hod", "teacher"] as const;
export type CourseRole = "teacher" | "ta" | "student";
export type Component = "cc" | "tp" | "exam" | "resit" | "other";

export type Institution = {
  id: string;
  name: string;
  slug: string;
  default_locale: "fr" | "en";
  grading_system: "lmd20" | "gpa4";
  short_name?: string;
  brand_color?: string;
  logo_path?: string;
};

export type Course = {
  id: string;
  institution_id: string;
  department_id?: string | null;
  code: string;
  title: string;
  description: string;
  language: "fr" | "en";
  level: string | null;
  color: string;
  published: boolean;
};

export type Module = {
  id: string;
  course_id: string;
  title: string;
  position: number;
  published: boolean;
};

export type ModuleItem = {
  id: string;
  module_id: string;
  item_type: "page" | "assignment" | "link" | "header";
  title: string;
  page_id: string | null;
  assignment_id: string | null;
  url: string | null;
  position: number;
};

export type Page = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  published: boolean;
  updated_at: string;
};

export type Assignment = {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_at: string | null;
  points_possible: number;
  submission_types: string[];
  component: Component;
  weight: number;
  published: boolean;
  created_at: string;
};

export type Announcement = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  author_id: string | null;
  created_at: string;
};

export type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  body: string | null;
  file_path: string | null;
  file_name: string | null;
  submitted_at: string;
};

export type Grade = {
  id: string;
  assignment_id: string;
  student_id: string;
  score: number | null;
  comment: string | null;
  graded_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
};

export type QuestionType = "single" | "multiple" | "true_false" | "short" | "numeric" | "essay";
export type QuestionOption = { id: string; text: string };

export type Question = {
  id: string;
  bank_id: string;
  qtype: QuestionType;
  prompt: string;
  options: QuestionOption[];
  points: number;
  position: number;
};

export type Quiz = {
  id: string;
  assignment_id: string;
  bank_id: string;
  question_count: number | null;
  time_limit_minutes: number | null;
  attempts_allowed: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results: "never" | "after_submit" | "after_due";
};

export type QuizAttempt = {
  id: string;
  quiz_id: string;
  assignment_id: string;
  student_id: string;
  attempt_no: number;
  question_ids: string[];
  option_orders: Record<string, string[]>;
  answers: Record<string, unknown>;
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  needs_review: boolean;
};

/** Shape returned by the quiz_attempt_review() database function. */
export type AttemptReview = {
  attempt_id: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  needs_review: boolean;
  show_keys: boolean;
  questions: Array<{
    id: string;
    qtype: QuestionType;
    prompt: string;
    options: QuestionOption[];
    points: number;
    answer: unknown;
    earned: number | null;
    manual: boolean;
    correct: unknown;
    explanation: string | null;
  }>;
};

// ---------------------------------------------------------------------------
// Sprint 3: engagement
// ---------------------------------------------------------------------------
export type NotificationKind =
  | "announcement"
  | "assignment"
  | "grade"
  | "submission"
  | "message"
  | "discussion"
  | "results"
  | "attendance"
  | "teaching";

export type AppNotification = {
  id: number;
  kind: NotificationKind;
  data: Record<string, string | number | null>;
  link: string | null;
  course_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type EventKind = "class" | "exam" | "event" | "office_hours" | "holiday";

export type CalendarEvent = {
  id: string;
  institution_id: string;
  course_id: string | null;
  title: string;
  description: string;
  location: string | null;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  repeat_weekly_until: string | null;
};

export type DiscussionTopic = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  author_id: string | null;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  created_at: string;
  last_activity_at: string;
};

export type DiscussionReply = {
  id: string;
  topic_id: string;
  parent_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type Conversation = {
  id: string;
  subject: string;
  course_id: string | null;
  created_at: string;
  last_message_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
};

export type RubricLevel = { id: string; title: string; points: number };
export type RubricCriterion = { id: string; title: string; description?: string; levels: RubricLevel[] };
export type Rubric = { id: string; course_id: string; title: string; criteria: RubricCriterion[] };
export type RubricRatings = Record<string, { level: string; points?: number; comment?: string }>;

export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type AttendanceSession = { id: string; course_id: string; starts_at: string; topic: string };
export type AttendanceRecord = {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  method: "teacher" | "code";
  marked_at: string;
};

export type CourseFile = {
  id: string;
  course_id: string;
  folder: string;
  name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  published: boolean;
  created_at: string;
};
