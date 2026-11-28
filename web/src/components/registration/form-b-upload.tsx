"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText } from "lucide-react";
import { buttonClass } from "@/components/ui";

type Course = { code: string; title: string; credits: number | null; semester: string; status: "in" | "joins" | "waiting" };
type Preview = {
  matricule: string;
  matricule_ok: boolean;
  academic_year: string | null;
  year_ok: boolean | null;
  courses: Course[];
  unknown: string[];
  used_by_other: boolean;
};
type Applied = { registered: number; joined: number; waiting: number; removed: number };
type Labels = {
  choose: string;
  reading: string;
  photoNote: string;
  matriculeOk: string;
  yearOk: string;
  yearUnknown: string;
  found: string;
  statusIn: string;
  statusJoins: string;
  statusWaiting: string;
  unknown: string;
  dropNote: string;
  register: string;
  registering: string;
  done: string;
  credits: string;
  errors: Record<string, string>;
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

async function send(file: File, mode: "check" | "apply") {
  const body = new FormData();
  body.set("file", file);
  body.set("mode", mode);
  const res = await fetch("/api/form-b", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { error?: string; result?: unknown };
  return json;
}

/** The student picks their Form B, sees what it would register, then registers. */
export function FormBUpload({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "reading" }
    | { kind: "error"; code: string }
    | { kind: "preview"; file: File; data: Preview }
    | { kind: "applying"; file: File; data: Preview }
    | { kind: "done"; data: Applied }
  >({ kind: "idle" });
  const err = (code: string) => labels.errors[code] ?? labels.errors.generic;

  async function onFile(file: File) {
    setState({ kind: "reading" });
    const json = await send(file, "check");
    if (json.error || !json.result) return setState({ kind: "error", code: json.error ?? "generic" });
    const data = json.result as Preview;
    if (!data.matricule_ok) return setState({ kind: "error", code: "form_b_not_yours" });
    if (data.year_ok === false) return setState({ kind: "error", code: "form_b_wrong_year" });
    if (data.used_by_other) return setState({ kind: "error", code: "form_b_used" });
    if (!data.courses.length) return setState({ kind: "error", code: "form_b_no_courses" });
    setState({ kind: "preview", file, data });
  }

  async function apply(file: File, data: Preview) {
    setState({ kind: "applying", file, data });
    const json = await send(file, "apply");
    if (json.error || !json.result) return setState({ kind: "error", code: json.error ?? "generic" });
    setState({ kind: "done", data: json.result as Applied });
    router.refresh();
  }

  const status = (s: Course["status"]) =>
    s === "in" ? (
      <span className="text-leaf-700">{labels.statusIn}</span>
    ) : s === "joins" ? (
      <span className="text-brand-700">{labels.statusJoins}</span>
    ) : (
      <span className="text-slate-500">{labels.statusWaiting}</span>
    );

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-paper px-5 py-7 text-center hover:border-ardoise">
        <FileText size={26} className="text-brand-500" aria-hidden />
        <span className="text-[15px] font-semibold text-slate-800">{labels.choose}</span>
        <span className="text-[13px] text-slate-500">{labels.photoNote}</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={state.kind === "reading" || state.kind === "applying"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {state.kind === "reading" ? <p role="status" className="text-[14.5px] text-slate-600">{labels.reading}</p> : null}
      {state.kind === "error" ? (
        <p role="alert" className="rounded-xl bg-terracotta-50 px-4 py-3 text-[14.5px] text-terracotta-700">
          {err(state.code)}
        </p>
      ) : null}

      {state.kind === "preview" || state.kind === "applying" ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-paper p-4">
          <ul className="space-y-1 text-[14px] text-slate-700">
            <li className="flex items-center gap-2">
              <Check size={15} className="text-leaf-600" aria-hidden />
              {fill(labels.matriculeOk, { m: state.data.matricule })}
            </li>
            <li className="flex items-center gap-2">
              <Check size={15} className={state.data.year_ok ? "text-leaf-600" : "text-slate-300"} aria-hidden />
              {state.data.year_ok ? fill(labels.yearOk, { y: state.data.academic_year ?? "" }) : labels.yearUnknown}
            </li>
          </ul>
          <p className="font-semibold text-slate-900">{fill(labels.found, { n: state.data.courses.length })}</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-[14px]">
            {state.data.courses.map((c) => (
              <li key={`${c.code}-${c.semester}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="w-24 shrink-0 font-semibold text-brand-600">{c.code}</span>
                <span className="min-w-0 flex-1 text-slate-800">{c.title}</span>
                <span className="text-[13px] text-slate-500">
                  {[c.semester, c.credits ? fill(labels.credits, { n: Number(c.credits) }) : null].filter(Boolean).join(" · ")}
                </span>
                <span className="w-full text-[13px] sm:w-auto">{status(c.status)}</span>
              </li>
            ))}
          </ul>
          {state.data.unknown.length ? (
            <p className="text-[13.5px] text-slate-600">{fill(labels.unknown, { codes: state.data.unknown.join(", ") })}</p>
          ) : null}
          <p className="text-[13.5px] text-slate-500">{labels.dropNote}</p>
          <button
            type="button"
            className={buttonClass("primary", "md")}
            disabled={state.kind === "applying"}
            onClick={() => void apply(state.file, state.data)}
          >
            {state.kind === "applying" ? labels.registering : fill(labels.register, { n: state.data.courses.length })}
          </button>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <p role="status" className="rounded-xl bg-leaf-50 px-4 py-3 text-[14.5px] text-leaf-700">
          {fill(labels.done, { ...state.data })}
        </p>
      ) : null}
    </div>
  );
}
