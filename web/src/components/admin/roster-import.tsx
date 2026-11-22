"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { parseCsv, readWorkbook, type ColumnKey, type Columns, type CourseInfo, type RosterRow } from "@/lib/roster";
import type { ImportResult } from "@/app/(app)/admin/students/actions";

type Labels = {
  chooseFile: string;
  reading: string;
  found: string;
  sheets: string;
  detected: string;
  noData: string;
  badFile: string;
  import: string;
  progress: string;
  result: string;
  unknownCourses: string;
  coursesCreated: string;
  semester: string;
  columnNames: Record<ColumnKey, string>;
  error: string;
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const BATCH = 1000;

type Cell = string | number | boolean | Date | null | undefined;

/**
 * Reads the registrar's Excel workbook (every sheet: students, courses, or both) or a CSV in
 * the browser, shows what will be created, then sends it in batches so a list of tens of
 * thousands of students goes through.
 */
export function RosterImport({
  institutionId,
  action,
  labels,
  semesters,
  currentSemester,
}: {
  institutionId: string;
  action: (institutionId: string, rows: RosterRow[], semesterId: string | null, courses: CourseInfo[]) => Promise<ImportResult | { error: string }>;
  labels: Labels;
  semesters: Array<{ id: string; label: string }>;
  currentSemester: string | null;
}) {
  const [semester, setSemester] = useState(currentSemester ?? semesters[0]?.id ?? "");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "reading" }
    | { kind: "error"; message: string }
    | {
        kind: "ready";
        file: string;
        rows: RosterRow[];
        courses: CourseInfo[];
        columns: Columns;
        registrations: number;
        sheetNames: string[];
      }
    | { kind: "importing"; done: number; total: number }
    | { kind: "done"; result: ImportResult }
  >({ kind: "idle" });
  const [, start] = useTransition();

  async function onFile(file: File) {
    setState({ kind: "reading" });
    try {
      let sheets: Array<{ name: string; data: Cell[][] }>;
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        sheets = (await readXlsxFile(file)).map((s) => ({ name: s.sheet, data: s.data as Cell[][] }));
      } else {
        sheets = [{ name: file.name, data: parseCsv(await file.text()) }];
      }
      const book = readWorkbook(sheets);
      if (!book.rows.length && !book.courses.length) {
        setState({ kind: "error", message: labels.noData });
        return;
      }
      setState({
        kind: "ready",
        file: file.name,
        rows: book.rows,
        courses: book.courses,
        columns: book.columns,
        registrations: book.registrations,
        sheetNames: [...book.sheets.courses, ...book.sheets.students],
      });
    } catch {
      setState({ kind: "error", message: labels.badFile });
    }
  }

  function run(rows: RosterRow[], courses: CourseInfo[]) {
    start(async () => {
      const total: ImportResult = { created: 0, updated: 0, course_links: 0, enrolled: 0, claims_linked: 0, unknown_courses: [], courses_created: 0 };
      const batches = Math.max(1, Math.ceil(rows.length / BATCH));
      for (let b = 0; b < batches; b++) {
        setState({ kind: "importing", done: Math.min(b * BATCH, rows.length), total: rows.length });
        const res = await action(institutionId, rows.slice(b * BATCH, (b + 1) * BATCH), semester || null, b === 0 ? courses : []);
        if ("error" in res) {
          setState({ kind: "error", message: labels.error });
          return;
        }
        total.created += res.created;
        total.updated += res.updated;
        total.course_links += res.course_links;
        total.enrolled += res.enrolled;
        total.claims_linked += res.claims_linked;
        total.courses_created += res.courses_created;
        for (const c of res.unknown_courses) if (!total.unknown_courses.includes(c)) total.unknown_courses.push(c);
      }
      setState({ kind: "done", result: total });
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-paper px-5 py-8 text-center hover:border-ardoise">
        <FileSpreadsheet size={28} className="text-brand-500" aria-hidden />
        <span className="text-[15px] font-semibold text-slate-800">{labels.chooseFile}</span>
        <span className="text-[13px] text-slate-500">.xlsx · .csv</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {state.kind === "reading" ? <p className="text-[14.5px] text-slate-600">{labels.reading}</p> : null}
      {state.kind === "error" ? <p className="rounded-xl bg-terracotta-50 px-4 py-3 text-[14.5px] text-terracotta-700">{state.message}</p> : null}

      {state.kind === "ready" ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-paper p-4">
          <p className="font-semibold text-slate-900">
            {state.file} — {fill(labels.found, { students: state.rows.length, courses: state.courses.length, registrations: state.registrations })}
          </p>
          {state.sheetNames.length > 1 ? (
            <p className="text-[13.5px] text-slate-600">{fill(labels.sheets, { names: state.sheetNames.join(", ") })}</p>
          ) : null}
          {Object.keys(state.columns).length ? (
            <p className="text-[13.5px] text-slate-600">
              {labels.detected} : {(Object.keys(state.columns) as ColumnKey[]).map((k) => labels.columnNames[k]).join(" · ")}
            </p>
          ) : null}
          {state.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <tbody>
                  {state.rows.slice(0, 4).map((r) => (
                    <tr key={r.matricule} className="border-t border-slate-100">
                      <td className="num py-1.5 pr-3 font-semibold">{r.matricule}</td>
                      <td className="py-1.5 pr-3">{r.full_name}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{[r.programme, r.level].filter(Boolean).join(" · ")}</td>
                      <td className="py-1.5 text-slate-500">{r.courses.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {semesters.length ? (
            <label className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-slate-700">
              {labels.semester}
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="h-10 rounded-[10px] border border-slate-300 bg-white px-3 text-[14px] font-normal"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => run(state.rows, state.courses)}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-ardoise px-5 text-[15px] font-semibold text-chalk hover:bg-brand-600"
          >
            <Upload size={17} aria-hidden />
            {labels.import}
          </button>
        </div>
      ) : null}

      {state.kind === "importing" ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-paper p-4" role="status">
          <p className="text-[14.5px] text-slate-700">{fill(labels.progress, { done: state.done, total: state.total })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-ardoise transition-[width]"
              style={{ width: `${state.total ? Math.round((state.done / state.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="space-y-2 rounded-2xl bg-leaf-50 px-4 py-3 text-[14.5px] text-slate-800 ring-1 ring-leaf-100">
          {state.result.courses_created ? <p>{fill(labels.coursesCreated, { n: state.result.courses_created })}</p> : null}
          <p>
            {fill(labels.result, {
              created: state.result.created,
              updated: state.result.updated,
              links: state.result.course_links,
              enrolled: state.result.enrolled,
              linked: state.result.claims_linked,
            })}
          </p>
          {state.result.unknown_courses.length ? (
            <p className="text-ochre-800">{fill(labels.unknownCourses, { codes: state.result.unknown_courses.join(", ") })}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
