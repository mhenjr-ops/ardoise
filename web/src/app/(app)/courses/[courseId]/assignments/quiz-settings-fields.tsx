import { Field, Input, Select } from "@/components/ui";
import type { Messages } from "@/lib/i18n/messages";
import type { Quiz } from "@/lib/types";

/** Settings shared by the new-quiz and edit-quiz forms. */
export function QuizSettingsFields({ t, quiz }: { t: Messages; quiz?: Quiz }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label={t.quiz.questionCount}>
        <Input name="question_count" type="number" min="1" defaultValue={quiz?.question_count ?? ""} />
      </Field>
      <Field label={t.quiz.timeLimit}>
        <Input name="time_limit_minutes" type="number" min="1" max="600" defaultValue={quiz?.time_limit_minutes ?? ""} />
      </Field>
      <Field label={t.quiz.attempts}>
        <Input name="attempts_allowed" type="number" min="1" max="10" defaultValue={quiz?.attempts_allowed ?? 1} required />
      </Field>
      <Field label={t.quiz.showResults}>
        <Select name="show_results" defaultValue={quiz?.show_results ?? "after_submit"}>
          {(["after_submit", "after_due", "never"] as const).map((v) => (
            <option key={v} value={v}>
              {t.quiz.showResultsOptions[v]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col justify-end gap-2 text-sm sm:col-span-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="shuffle_questions"
            defaultChecked={quiz?.shuffle_questions ?? true}
            className="h-4 w-4 accent-brand-600"
          />
          {t.quiz.shuffleQuestions}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="shuffle_options"
            defaultChecked={quiz?.shuffle_options ?? true}
            className="h-4 w-4 accent-brand-600"
          />
          {t.quiz.shuffleOptions}
        </label>
      </div>
    </div>
  );
}
