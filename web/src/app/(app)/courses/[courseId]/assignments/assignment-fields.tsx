import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Messages } from "@/lib/i18n/messages";
import type { Assignment } from "@/lib/types";
import { isoToCameroonLocal } from "@/lib/format";

/** Shared fields for creating and editing an assignment. */
export function AssignmentFields({
  t,
  assignment,
  quiz = false,
  rubrics = [],
}: {
  t: Messages;
  assignment?: Assignment & { rubric_id?: string | null };
  quiz?: boolean;
  rubrics?: Array<{ id: string; title: string }>;
}) {
  const types = assignment?.submission_types ?? ["text", "file"];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t.common.title}>
          <Input name="title" required defaultValue={assignment?.title} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={t.assignments.instructions}>
          <Textarea name="description" rows={5} defaultValue={assignment?.description} />
        </Field>
      </div>
      <Field label={`${t.assignments.dueAt} (WAT)`}>
        <Input name="due_at" type="datetime-local" defaultValue={isoToCameroonLocal(assignment?.due_at)} />
      </Field>
      <Field label={t.assignments.component}>
        <Select name="component" defaultValue={assignment?.component ?? "cc"}>
          {(["cc", "tp", "exam", "resit", "other"] as const).map((c) => (
            <option key={c} value={c}>
              {t.assignments.components[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.assignments.pointsPossible}>
        <Input name="points_possible" type="number" min="1" step="0.5" defaultValue={assignment?.points_possible ?? 20} />
      </Field>
      <Field label={t.assignments.weight}>
        <Input name="weight" type="number" min="0" step="0.5" defaultValue={assignment?.weight ?? 1} />
      </Field>
      {!quiz && rubrics.length ? (
        <div className="sm:col-span-2">
          <Field label={t.rubrics.attach}>
            <Select name="rubric_id" defaultValue={assignment?.rubric_id ?? ""}>
              <option value="">{t.rubrics.none}</option>
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-5 text-[15px] sm:col-span-2">
        {quiz ? null : (
          <>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="submission_types" value="text" defaultChecked={types.includes("text")} className="h-4 w-4 accent-brand-600" />
          {t.assignments.textAnswer}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="submission_types" value="file" defaultChecked={types.includes("file")} className="h-4 w-4 accent-brand-600" />
          {t.assignments.file}
        </label>
          </>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="published" defaultChecked={assignment?.published ?? true} className="h-4 w-4 accent-brand-600" />
          {t.common.published}
        </label>
      </div>
    </div>
  );
}
