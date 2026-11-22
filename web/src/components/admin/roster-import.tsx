"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { parseCsv, rowsFromTable, type ColumnKey, type Columns, type RosterRow } from "@/lib/roster";
import type { ImportResult } from "@/app/(app)/admin/students/actions";

type Labels = {
  chooseFile: string;
  reading: string;
  preview: string;
  detected: string;
  noMatricule: string;
  badFile: string;
  import: string;
  importing: string;
  result: string;
  unknownCourses: string;
  columnNames: Record<ColumnKey, string>;
  error: string;
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** Reads the registrar's file in the browser, shows what will be imported, then imports it. */
export function RosterImport({
  institutionId,
  action,
  labels,
}: {
  institutionId: string;
  action: (institutionId: string, rows: RosterRow[]) => Promise<ImportResult | { error: string }>;
  labels: Labels;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "reading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; file: string; rows: RosterRow[]; columns: Columns; registrations: number }
    | { kind: "done"; result: ImportResult }
  >({ kind: "idle" });
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setState({ kind: "reading" });
    try {
      let table: unknown[][];
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        table = (await readSheet(file)) as unknown[][];
      } else {
        table = parseCsv(await file.text());
      }
      const parsed = rowsFromTable(table as Parameters<typeof rowsFromTable>[0]);
      if (parsed.headerRow < 0 || parsed.rows.length === 0) {
        setState({ kind: "error", message: labels.noMatricule });
        return;
      }
      setState({ kind: "ready", file: file.name, rows: parsed.rows, columns: parsed.columns, registrations: parsed.registrations });
    } catch {
      setState({ kind: "error", message: labels.badFile });
    }
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
            {state.file} — {fill(labels.preview, { n: state.rows.length, c: state.registrations })}
          </p>
          <p className="text-[13.5px] text-slate-600">
            {labels.detected} :{" "}
            {(Object.keys(state.columns) as ColumnKey[]).map((k) => labels.columnNames[k]).join(" · ")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <tbody>
                {state.rows.slice(0, 5).map((r) => (
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
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await action(institutionId, state.rows);
                if ("error" in res) setState({ kind: "error", message: labels.error });
                else setState({ kind: "done", result: res });
              })
            }
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-ardoise px-5 text-[15px] font-semibold text-chalk hover:bg-brand-600 disabled:opacity-60"
          >
            <Upload size={17} aria-hidden />
            {pending ? labels.importing : fill(labels.import, { n: state.rows.length })}
          </button>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="space-y-2 rounded-2xl bg-leaf-50 px-4 py-3 text-[14.5px] text-slate-800 ring-1 ring-leaf-100">
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
