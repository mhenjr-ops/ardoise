"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { QuestionType } from "@/lib/types";
import { createQuestion } from "../actions";

type Labels = {
  addQuestion: string;
  type: string;
  types: Record<QuestionType, string>;
  prompt: string;
  points: string;
  options: string;
  addOption: string;
  acceptedAnswers: string;
  value: string;
  tolerance: string;
  explanation: string;
  essayNote: string;
  trueLabel: string;
  falseLabel: string;
  remove: string;
};

type Option = { id: string; text: string; correct: boolean };

let counter = 0;
const newOption = (): Option => ({ id: `o${++counter}`, text: "", correct: false });

export function QuestionForm({ courseId, bankId, labels }: { courseId: string; bankId: string; labels: Labels }) {
  const [qtype, setQtype] = useState<QuestionType>("single");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState("1");
  const [options, setOptions] = useState<Option[]>([newOption(), newOption(), newOption(), newOption()]);
  const [trueFalse, setTrueFalse] = useState(true);
  const [accepted, setAccepted] = useState("");
  const [value, setValue] = useState("");
  const [tolerance, setTolerance] = useState("0");
  const [explanation, setExplanation] = useState("");

  const payload = JSON.stringify({ qtype, prompt, points: Number(points.replace(",", ".")), options, trueFalse, accepted, value, tolerance, explanation });

  function toggleCorrect(id: string) {
    setOptions((list) =>
      list.map((o) => (qtype === "single" ? { ...o, correct: o.id === id } : o.id === id ? { ...o, correct: !o.correct } : o)),
    );
  }

  return (
    <form action={createQuestion} className="space-y-4">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="bank_id" value={bankId} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label={labels.type}>
          <Select value={qtype} onChange={(e) => setQtype(e.target.value as QuestionType)}>
            {(Object.keys(labels.types) as QuestionType[]).map((k) => (
              <option key={k} value={k}>
                {labels.types[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.points}>
          <Input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="decimal" required />
        </Field>
      </div>

      <Field label={labels.prompt}>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} required />
      </Field>

      {qtype === "single" || qtype === "multiple" ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">{labels.options}</legend>
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type={qtype === "single" ? "radio" : "checkbox"}
                name="correct-ui"
                checked={o.correct}
                onChange={() => toggleCorrect(o.id)}
                className="h-4 w-4 shrink-0 accent-brand-600"
                aria-label={`${labels.options} ${i + 1}`}
              />
              <Input
                value={o.text}
                onChange={(e) => setOptions((list) => list.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                placeholder={String.fromCharCode(65 + i)}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  onClick={() => setOptions((list) => list.filter((x) => x.id !== o.id))}
                  className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                >
                  {labels.remove}
                </button>
              ) : null}
            </div>
          ))}
          {options.length < 8 ? (
            <button type="button" onClick={() => setOptions((list) => [...list, newOption()])} className="text-sm font-medium text-brand-700">
              {labels.addOption}
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {qtype === "true_false" ? (
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={trueFalse} onChange={() => setTrueFalse(true)} className="h-4 w-4 accent-brand-600" />
            {labels.trueLabel}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!trueFalse} onChange={() => setTrueFalse(false)} className="h-4 w-4 accent-brand-600" />
            {labels.falseLabel}
          </label>
        </div>
      ) : null}

      {qtype === "short" ? (
        <Field label={labels.acceptedAnswers}>
          <Textarea value={accepted} onChange={(e) => setAccepted(e.target.value)} rows={3} />
        </Field>
      ) : null}

      {qtype === "numeric" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={labels.value}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={labels.tolerance}>
            <Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
      ) : null}

      {qtype === "essay" ? <p className="text-sm text-slate-500">{labels.essayNote}</p> : null}

      <Field label={labels.explanation}>
        <Input value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </Field>

      <Button type="submit">{labels.addQuestion}</Button>
    </form>
  );
}
