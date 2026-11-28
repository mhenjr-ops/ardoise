"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet } from "lucide-react";
import { catalogueFromWorkbook, type CatalogueColumn, type CatalogueRow } from "@/lib/catalogue";
import { parseCsv } from "@/lib/roster";
import type { CatalogueImportResult } from "@/lib/catalogue-actions";
import { buttonClass } from "@/components/ui";

type Labels = {
  chooseFile: string;
  reading: string;
  found: string;
  detected: string;
  noData: string;
  badFile: string;
  importAll: string;
  progress: string;
  result: string;
  unknownDeps: string;
  error: string;
  columns: Record<CatalogueColumn, string>;
};
type Cell = string | number | boolean | Date | null | undefined;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
// Small enough that one batch finishes well inside the database's time limit.
const BATCH = 400;

/** Reads a course list in the browser, shows what it found, then sends it in batches. */
export function CatalogueImport({
  institutionId,
  action,
  labels,
}: {
  institutionId: string;
  action: (institutionId: string, rows: CatalogueRow[]) => Promise<CatalogueImportResult | { error: string }>;
  labels: Labels;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "reading" }
    | { kind: "error"; message: string; partial?: CatalogueImportResult }
    | { kind: "ready"; file: string; rows: CatalogueRow[]; courses: number; departments: number; columns: CatalogueColumn[] }
    | { kind: "importing"; done: number; total: number }
    | { kind: "done"; result: CatalogueImportResult }
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
      const book = catalogueFromWorkbook(sheets);
      if (!book.rows.length) {
        setState({ kind: "error", message: labels.noData });
        return;
      }
      const order: CatalogueColumn[] = ["code", "title", "level", "semester", "credits", "school", "department"];
      setState({
        kind: "ready",
        file: file.name,
        rows: book.rows,
        courses: book.courses,
        departments: book.departments,
        columns: order.filter((k) => book.columns[k] !== undefined),
      });
    } catch {
      setState({ kind: "error", message: labels.badFile });
    }
  }

  function run(rows: CatalogueRow[]) {
    start(async () => {
      const total: CatalogueImportResult = { created: 0, updated: 0, linked: 0, new_departments: 0, skipped: 0, unknown_departments: [] };
      for (let b = 0; b < rows.length; b += BATCH) {
        setState({ kind: "importing", done: b, total: rows.length });
        let res: CatalogueImportResult | { error: string };
        try {
          res = await action(institutionId, rows.slice(b, b + BATCH));
        } catch {
          res = { error: "generic" };
        }
        if ("error" in res) {
          setState({ kind: "error", message: labels.error, partial: total });
          return;
        }
        total.created += res.created;
        total.updated += res.updated;
        total.linked += res.linked;
        total.new_departments += res.new_departments;
        total.skipped += res.skipped;
        for (const d of res.unknown_departments ?? []) if (!total.unknown_departments.includes(d)) total.unknown_departments.push(d);
      }
      setState({ kind: "done", result: total });
    });
  }

  const summary = (r: CatalogueImportResult) => (
    <>
      <p>
        {fill(labels.result, { created: r.created, updated: r.updated, linked: r.linked, newDeps: r.new_departments, skipped: r.skipped })}
      </p>
      {r.unknown_departments.length ? (
        <p className="mt-1.5 text-[13.5px]">{fill(labels.unknownDeps, { names: r.unknown_departments.slice(0, 30).join(", ") })}</p>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-paper px-5 py-7 text-center hover:border-ardoise">
        <FileSpreadsheet size={26} className="text-brand-500" aria-hidden />
        <span className="text-[15px] font-semibold text-slate-800">{labels.chooseFile}</span>
        <span className="text-[13px] text-slate-500">.xlsx · .csv</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={state.kind === "importing"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {state.kind === "reading" ? <p className="text-[14.5px] text-slate-600">{labels.reading}</p> : null}
      {state.kind === "error" ? (
        <div role="alert" className="rounded-xl bg-terracotta-50 px-4 py-3 text-[14.5px] text-terracotta-700">
          <p>{state.message}</p>
          {state.partial && (state.partial.created || state.partial.updated) ? <div className="mt-1.5">{summary(state.partial)}</div> : null}
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-paper p-4">
          <p className="font-semibold text-slate-900">
            {state.file}: {fill(labels.found, { rows: state.rows.length, courses: state.courses, departments: state.departments })}
          </p>
          <p className="text-[13.5px] text-slate-600">
            {fill(labels.detected, { names: state.columns.map((k) => labels.columns[k]).join(", ") })}
          </p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-[13.5px]">
            {state.rows.slice(0, 5).map((r, i) => (
              <li key={i} className="flex gap-3 px-3 py-2">
                <span className="w-24 shrink-0 font-semibold text-brand-600">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-slate-800">{r.title}</span>
                <span className="hidden shrink-0 truncate text-slate-500 sm:block sm:max-w-[40%]">{[r.school, r.department].filter(Boolean).join(" / ")}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => run(state.rows)}
            className={buttonClass("primary", "md")}
          >
            {fill(labels.importAll, { n: state.rows.length })}
          </button>
        </div>
      ) : null}

      {state.kind === "importing" ? (
        <div role="status" className="space-y-2">
          <p className="text-[14.5px] text-slate-700">{fill(labels.progress, { done: state.done, total: state.total })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${Math.round((state.done / Math.max(state.total, 1)) * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div role="status" className="rounded-xl bg-leaf-50 px-4 py-3 text-[14.5px] text-leaf-700">
          {summary(state.result)}
        </div>
      ) : null}
    </div>
  );
}
