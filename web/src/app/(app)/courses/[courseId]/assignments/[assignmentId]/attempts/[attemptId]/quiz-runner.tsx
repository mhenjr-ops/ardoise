"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CloudOff, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import type { QuestionOption, QuestionType } from "@/lib/types";

type RunnerQuestion = { id: string; qtype: QuestionType; prompt: string; options: QuestionOption[]; points: number };
type Answers = Record<string, unknown>;

type Labels = {
  timeLeft: string;
  saved: string;
  saving: string;
  offline: string;
  submit: string;
  confirmSubmit: string;
  answered: string;
  trueLabel: string;
  falseLabel: string;
  points: string;
  timeUp: string;
  error: string;
  cancel: string;
};

function isAnswered(v: unknown) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function QuizRunner({
  attemptId,
  questions,
  initialAnswers,
  deadline,
  serverNow,
  labels,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  initialAnswers: Answers;
  deadline: string | null;
  serverNow: string;
  labels: Labels;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const storageKey = `ardoise-quiz-${attemptId}`;

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const answersRef = useRef(answers);
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);
  const offsetRef = useRef<number | null>(null);

  const save = useCallback(async () => {
    if (submittedRef.current || !dirtyRef.current) return;
    dirtyRef.current = false;
    setStatus("saving");
    const { data, error } = await supabase.rpc("save_quiz_answers", { p_attempt: attemptId, p_answers: answersRef.current });
    if (error) {
      dirtyRef.current = true;
      setStatus("offline");
      return;
    }
    if ((data as { status?: string } | null)?.status === "time_up") {
      submittedRef.current = true;
      setMessage(labels.timeUp);
      router.refresh();
      return;
    }
    setStatus("saved");
  }, [attemptId, labels.timeUp, router, supabase]);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_quiz_attempt", { p_attempt: attemptId, p_answers: answersRef.current });
    if (error) {
      submittedRef.current = false;
      setSubmitting(false);
      setMessage(labels.error);
      return;
    }
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    router.refresh();
  }, [attemptId, labels.error, router, storageKey, supabase]);

  // A local copy survives a lost connection or a closed tab: restore it if it is ahead of the server.
  useEffect(() => {
    try {
      const local = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Answers | null;
      if (local && Object.keys(local).length > Object.keys(initialAnswers).length) {
        dirtyRef.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from device storage
        setAnswers(local);
      }
    } catch {
      // storage unavailable: server copy only
    }
  }, [storageKey, initialAnswers]);

  // Debounced autosave after each change; retries every 5 s while offline.
  useEffect(() => {
    answersRef.current = answers;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch {
      // ignore
    }
    const timer = window.setTimeout(save, 1200);
    return () => window.clearTimeout(timer);
  }, [answers, save, storageKey]);

  useEffect(() => {
    if (status !== "offline") return;
    const retry = window.setInterval(() => {
      dirtyRef.current = true;
      save();
    }, 5000);
    return () => window.clearInterval(retry);
  }, [status, save]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [save]);

  // Countdown on the server's clock (phones are often set to the wrong time).
  useEffect(() => {
    if (!deadline) return;
    if (offsetRef.current === null) offsetRef.current = new Date(serverNow).getTime() - Date.now();
    const tick = () => {
      const left = new Date(deadline).getTime() - (Date.now() + (offsetRef.current ?? 0));
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        setMessage(labels.timeUp);
        submit();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline, serverNow, submit, labels.timeUp]);

  function setAnswer(id: string, value: unknown) {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;
  const lowTime = remaining !== null && remaining < 60_000;

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:top-0">
        <div className="flex flex-wrap items-center gap-3">
          {remaining !== null ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ${
                lowTime ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-800"
              }`}
              aria-live="polite"
            >
              <Clock size={15} aria-hidden />
              {labels.timeLeft} {formatClock(remaining)}
            </span>
          ) : null}
          <span className="text-sm text-slate-600">
            {answeredCount} {labels.answered} {questions.length}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500" aria-live="polite">
            {status === "saving" ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden /> {labels.saving}
              </>
            ) : status === "saved" ? (
              <>
                <Check size={13} className="text-brand-600" aria-hidden /> {labels.saved}
              </>
            ) : status === "offline" ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <CloudOff size={13} aria-hidden /> {labels.offline}
              </span>
            ) : null}
          </span>
        </div>
        <nav className="mt-2 flex flex-wrap gap-1.5" aria-label="Questions">
          {questions.map((q, i) => (
            <a
              key={q.id}
              href={`#q-${q.id}`}
              className={`grid h-7 w-7 place-items-center rounded-md text-xs font-semibold ${
                isAnswered(answers[q.id]) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {i + 1}
            </a>
          ))}
        </nav>
      </div>

      {message ? <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p> : null}

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} id={`q-${q.id}`} className="scroll-mt-32 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="prose-lite text-[15px] font-medium text-slate-900">
                <span className="mr-2 text-slate-400">{i + 1}.</span>
                {q.prompt}
              </p>
              <span className="shrink-0 text-xs text-slate-500">
                {q.points} {labels.points}
              </span>
            </div>
            <QuestionInput question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} labels={labels} />
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              {labels.confirmSubmit}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
              {labels.cancel}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => setConfirming(true)}>
            {labels.submit}
          </Button>
        )}
        <span className="text-sm text-slate-500">
          {answeredCount} {labels.answered} {questions.length}
        </span>
      </div>
    </div>
  );
}

function QuestionInput({
  question: q,
  value,
  onChange,
  labels,
}: {
  question: RunnerQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  labels: Labels;
}) {
  const optionClass = (checked: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition ${
      checked ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
    }`;

  if (q.qtype === "single") {
    return (
      <div className="space-y-2" role="radiogroup">
        {q.options.map((o) => (
          <label key={o.id} className={optionClass(value === o.id)}>
            <input type="radio" name={q.id} checked={value === o.id} onChange={() => onChange(o.id)} className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>{o.text}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.qtype === "multiple") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-2">
        {q.options.map((o) => {
          const checked = selected.includes(o.id);
          return (
            <label key={o.id} className={optionClass(checked)}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>{o.text}</span>
            </label>
          );
        })}
      </div>
    );
  }
  if (q.qtype === "true_false") {
    return (
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {[true, false].map((v) => (
          <label key={String(v)} className={optionClass(value === v)}>
            <input type="radio" name={q.id} checked={value === v} onChange={() => onChange(v)} className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>{v ? labels.trueLabel : labels.falseLabel}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.qtype === "essay") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    );
  }
  return (
    <input
      value={typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      inputMode={q.qtype === "numeric" ? "decimal" : "text"}
      className="h-11 w-full max-w-md rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
    />
  );
}
