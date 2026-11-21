import type { Messages, Locale } from "@/lib/i18n/messages";
import type { QuestionOption, QuestionType } from "@/lib/types";
import { formatScore } from "@/lib/format";

type Q = { qtype: QuestionType; options: QuestionOption[] };

function optionText(q: Q, id: unknown) {
  const o = q.options.find((x) => x.id === id);
  return o ? `${o.id.toUpperCase()}. ${o.text}` : String(id);
}

/** Human-readable version of an answer key ("expected answer"). */
export function describeKey(q: Q, correct: unknown, t: Messages, locale: Locale): string {
  if (correct === null || correct === undefined) return q.qtype === "essay" ? t.quiz.essayNote : "—";
  switch (q.qtype) {
    case "single":
      return optionText(q, correct);
    case "multiple":
      return Array.isArray(correct) ? correct.map((id) => optionText(q, id)).join(" · ") : "—";
    case "true_false":
      return correct === true ? t.quiz.trueLabel : t.quiz.falseLabel;
    case "short":
      return Array.isArray(correct) ? correct.join(" / ") : String(correct);
    case "numeric": {
      const c = correct as { value: number; tolerance?: number };
      return c.tolerance ? `${formatScore(locale, c.value)} ± ${formatScore(locale, c.tolerance)}` : formatScore(locale, c.value);
    }
    default:
      return "—";
  }
}

/** Human-readable version of a student's answer. */
export function describeAnswer(q: Q, answer: unknown, t: Messages): string | null {
  if (answer === null || answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0)) return null;
  switch (q.qtype) {
    case "single":
      return optionText(q, answer);
    case "multiple":
      return Array.isArray(answer) ? answer.map((id) => optionText(q, id)).join(" · ") : null;
    case "true_false":
      return answer === true ? t.quiz.trueLabel : answer === false ? t.quiz.falseLabel : null;
    default:
      return String(answer);
  }
}
