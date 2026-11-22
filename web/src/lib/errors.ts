const KNOWN = [
  "user_not_found",
  "forbidden",
  "no_attempts_left",
  "empty_quiz",
  "question_in_use",
  "deliberation_locked",
  "must_lock_first",
  "deliberation_published",
  "bonus_too_high",
  "slug_taken",
  "invalid",
  "topic_locked",
  "in_use",
  "platform_account",
  "school_account",
];

/** Turns a Supabase/Postgres error into one of the translated error codes. */
export function errorCode(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "generic";
  if (error.code === "23505") return "duplicate";
  const message = error.message ?? "";
  return KNOWN.find((k) => message.includes(k)) ?? "generic";
}
