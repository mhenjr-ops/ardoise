"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { addItem } from "./actions";

type Labels = {
  addItem: string;
  itemType: string;
  page: string;
  assignment: string;
  link: string;
  header: string;
  url: string;
  title: string;
  body: string;
  add: string;
};

export function AddItemForm({
  courseId,
  moduleId,
  assignments,
  labels,
}: {
  courseId: string;
  moduleId: string;
  assignments: Array<{ id: string; title: string }>;
  labels: Labels;
}) {
  const [type, setType] = useState<"page" | "assignment" | "link" | "header">("page");

  return (
    <form action={addItem} className="grid gap-3 sm:grid-cols-[160px_1fr]">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="module_id" value={moduleId} />
      <Field label={labels.itemType}>
        <Select name="item_type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="page">{labels.page}</option>
          <option value="assignment" disabled={assignments.length === 0}>
            {labels.assignment}
          </option>
          <option value="link">{labels.link}</option>
          <option value="header">{labels.header}</option>
        </Select>
      </Field>

      {type === "assignment" ? (
        <Field label={labels.assignment}>
          <Select name="assignment_id" required>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label={labels.title}>
          <Input name="title" required />
        </Field>
      )}

      {type === "page" ? (
        <div className="sm:col-span-2">
          <Field label={labels.body}>
            <Textarea name="body" rows={6} />
          </Field>
        </div>
      ) : null}

      {type === "link" ? (
        <div className="sm:col-span-2">
          <Field label={labels.url}>
            <Input name="url" type="url" required placeholder="https://" />
          </Field>
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <Button type="submit" size="sm">
          {labels.add}
        </Button>
      </div>
    </form>
  );
}
