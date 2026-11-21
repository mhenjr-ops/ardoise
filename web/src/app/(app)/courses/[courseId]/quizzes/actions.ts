"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";
import { cameroonLocalToIso } from "@/lib/format";
import type { QuestionType } from "@/lib/types";

const TYPES: QuestionType[] = ["single", "multiple", "true_false", "short", "numeric", "essay"];
const COMPONENTS = ["cc", "tp", "exam", "resit", "other"];
const SHOW = ["after_submit", "after_due", "never"];

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalInt(value: string, min: number, max: number): number | null | "invalid" {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return "invalid";
  return n;
}

// ---------------------------------------------------------------------
// Question banks
// ---------------------------------------------------------------------
export async function createBank(formData: FormData) {
  const courseId = str(formData, "course_id");
  const title = str(formData, "title");
  const back = `/courses/${courseId}/quizzes`;
  if (!title) redirect(`${back}?error=invalid`);
  const { supabase } = await actionSession();
  const { data, error } = await supabase.from("question_banks").insert({ course_id: courseId, title }).select("id").single();
  if (error || !data) redirect(`${back}?error=${errorCode(error)}`);
  revalidatePath(back);
  redirect(`${back}/${data.id}`);
}

export async function deleteBank(formData: FormData) {
  const courseId = str(formData, "course_id");
  const bankId = str(formData, "bank_id");
  const { supabase } = await actionSession();
  const { error } = await supabase.from("question_banks").delete().eq("id", bankId);
  // A bank used by a quiz is protected by a foreign key (on delete restrict).
  if (error) redirect(`/courses/${courseId}/quizzes/${bankId}?error=${error.code === "23503" ? "question_in_use" : errorCode(error)}`);
  revalidatePath(`/courses/${courseId}/quizzes`);
  redirect(`/courses/${courseId}/quizzes`);
}

type QuestionPayload = {
  qtype: QuestionType;
  prompt: string;
  points: number;
  options: Array<{ id: string; text: string; correct: boolean }>;
  trueFalse: boolean;
  accepted: string;
  value: string;
  tolerance: string;
  explanation: string;
};

/** Validates the question form and returns the row, its key, or null when invalid. */
function buildQuestion(p: QuestionPayload) {
  if (!TYPES.includes(p.qtype) || !p.prompt?.trim() || !(Number(p.points) > 0)) return null;
  let options: Array<{ id: string; text: string }> = [];
  let correct: unknown = null;

  if (p.qtype === "single" || p.qtype === "multiple") {
    const kept = (p.options ?? []).filter((o) => o.text.trim()).slice(0, 8);
    const ids = "abcdefgh";
    options = kept.map((o, i) => ({ id: ids[i], text: o.text.trim() }));
    const correctIds = kept.map((o, i) => (o.correct ? ids[i] : null)).filter((x): x is string => x !== null);
    if (options.length < 2) return null;
    if (p.qtype === "single") {
      if (correctIds.length !== 1) return null;
      correct = correctIds[0];
    } else {
      if (correctIds.length < 1) return null;
      correct = correctIds;
    }
  } else if (p.qtype === "true_false") {
    correct = Boolean(p.trueFalse);
  } else if (p.qtype === "short") {
    const accepted = (p.accepted ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (accepted.length === 0) return null;
    correct = accepted;
  } else if (p.qtype === "numeric") {
    const value = Number(String(p.value).replace(",", "."));
    const tolerance = p.tolerance ? Number(String(p.tolerance).replace(",", ".")) : 0;
    if (!Number.isFinite(value) || !Number.isFinite(tolerance) || tolerance < 0) return null;
    correct = { value, tolerance };
  }
  return {
    question: { qtype: p.qtype, prompt: p.prompt.trim(), points: Number(p.points), options },
    key: { correct, explanation: p.explanation?.trim() || null },
  };
}

export async function createQuestion(formData: FormData) {
  const courseId = str(formData, "course_id");
  const bankId = str(formData, "bank_id");
  const back = `/courses/${courseId}/quizzes/${bankId}`;
  let payload: QuestionPayload;
  try {
    payload = JSON.parse(str(formData, "payload"));
  } catch {
    redirect(`${back}?error=invalid`);
  }
  const built = buildQuestion(payload);
  if (!built) redirect(`${back}?error=invalid`);

  const { supabase } = await actionSession();
  const { data: last } = await supabase
    .from("questions")
    .select("position")
    .eq("bank_id", bankId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("questions")
    .insert({ ...built.question, bank_id: bankId, position: (last?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) redirect(`${back}?error=${errorCode(error)}`);
  const { error: keyError } = await supabase.from("question_keys").insert({ question_id: data.id, ...built.key });
  if (keyError) {
    await supabase.from("questions").delete().eq("id", data.id);
    redirect(`${back}?error=${errorCode(keyError)}`);
  }
  revalidatePath(back);
  redirect(`${back}?ok=1#q-${data.id}`);
}

export async function deleteQuestion(formData: FormData) {
  const courseId = str(formData, "course_id");
  const bankId = str(formData, "bank_id");
  const id = str(formData, "id");
  const back = `/courses/${courseId}/quizzes/${bankId}`;
  const { supabase } = await actionSession();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) redirect(`${back}?error=${errorCode(error)}`);
  revalidatePath(back);
}

// ---------------------------------------------------------------------
// Quizzes (an assignment whose submission type is "quiz")
// ---------------------------------------------------------------------
function quizSettings(formData: FormData) {
  const questionCount = optionalInt(str(formData, "question_count"), 1, 500);
  const timeLimit = optionalInt(str(formData, "time_limit_minutes"), 1, 600);
  const attempts = Number(str(formData, "attempts_allowed") || 1);
  const show = str(formData, "show_results") || "after_submit";
  if (questionCount === "invalid" || timeLimit === "invalid" || !Number.isInteger(attempts) || attempts < 1 || attempts > 10 || !SHOW.includes(show)) {
    return null;
  }
  return {
    question_count: questionCount,
    time_limit_minutes: timeLimit,
    attempts_allowed: attempts,
    shuffle_questions: formData.get("shuffle_questions") === "on",
    shuffle_options: formData.get("shuffle_options") === "on",
    show_results: show,
  };
}

export async function createQuiz(formData: FormData) {
  const courseId = str(formData, "course_id");
  const back = `/courses/${courseId}/assignments`;
  const title = str(formData, "title");
  const bankId = str(formData, "bank_id");
  const points = Number(formData.get("points_possible") ?? 20);
  const weight = Number(formData.get("weight") ?? 1);
  const component = str(formData, "component") || "cc";
  const settings = quizSettings(formData);
  if (!title || !bankId || !settings || !(points > 0) || !(weight >= 0) || !COMPONENTS.includes(component)) {
    redirect(`${back}?error=invalid`);
  }

  const { supabase } = await actionSession();
  const { data: assignment, error } = await supabase
    .from("assignments")
    .insert({
      course_id: courseId,
      title,
      description: str(formData, "description"),
      due_at: cameroonLocalToIso(str(formData, "due_at") || null),
      points_possible: points,
      weight,
      component,
      published: formData.get("published") === "on",
      submission_types: ["quiz"],
    })
    .select("id")
    .single();
  if (error || !assignment) redirect(`${back}?error=${errorCode(error)}`);

  const { error: quizError } = await supabase.from("quizzes").insert({ assignment_id: assignment.id, bank_id: bankId, ...settings });
  if (quizError) {
    await supabase.from("assignments").delete().eq("id", assignment.id);
    redirect(`${back}?error=${errorCode(quizError)}`);
  }

  const moduleId = str(formData, "module_id");
  if (moduleId) {
    const { data: last } = await supabase
      .from("module_items")
      .select("position")
      .eq("module_id", moduleId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("module_items").insert({
      module_id: moduleId,
      item_type: "assignment",
      title,
      assignment_id: assignment.id,
      position: (last?.position ?? 0) + 1,
    });
  }
  revalidatePath(back);
  redirect(`${back}/${assignment.id}`);
}

export async function updateQuiz(formData: FormData) {
  const courseId = str(formData, "course_id");
  const assignmentId = str(formData, "assignment_id");
  const quizId = str(formData, "quiz_id");
  const back = `/courses/${courseId}/assignments/${assignmentId}`;
  const settings = quizSettings(formData);
  if (!settings) redirect(`${back}?error=invalid`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("quizzes").update(settings).eq("id", quizId);
  if (error) redirect(`${back}?error=${errorCode(error)}`);
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}

export async function startQuiz(formData: FormData) {
  const courseId = str(formData, "course_id");
  const assignmentId = str(formData, "assignment_id");
  const quizId = str(formData, "quiz_id");
  const back = `/courses/${courseId}/assignments/${assignmentId}`;
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("start_quiz_attempt", { p_quiz: quizId });
  if (error || !data) redirect(`${back}?error=${errorCode(error)}`);
  redirect(`${back}/attempts/${data as string}`);
}

export async function gradeQuestion(formData: FormData) {
  const courseId = str(formData, "course_id");
  const assignmentId = str(formData, "assignment_id");
  const attemptId = str(formData, "attempt_id");
  const questionId = str(formData, "question_id");
  const raw = str(formData, "points").replace(",", ".");
  const back = `/courses/${courseId}/assignments/${assignmentId}/attempts/${attemptId}`;
  const points = raw === "" ? null : Number(raw);
  if (points !== null && !Number.isFinite(points)) redirect(`${back}?error=invalid`);

  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("grade_quiz_question", { p_attempt: attemptId, p_question: questionId, p_points: points });
  if (error) redirect(`${back}?error=${errorCode(error)}`);
  revalidatePath(back);
  revalidatePath(`/courses/${courseId}/grades`);
  redirect(`${back}?ok=1#q-${questionId}`);
}
