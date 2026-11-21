"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Level = { title: string; points: string };
type Criterion = { title: string; description: string; levels: Level[] };

/** Build a rubric: criteria as rows, levels as columns. Posts JSON in "criteria". */
export function RubricEditor({
  defaultLevels,
  labels,
}: {
  defaultLevels: string[];
  labels: { criterion: string; addCriterion: string; level: string; addLevel: string; points: string; total: string };
}) {
  const fresh = (): Criterion => ({
    title: "",
    description: "",
    levels: defaultLevels.map((title, i) => ({ title, points: String([5, 3, 1][i] ?? 0) })),
  });
  const [rows, setRows] = useState<Criterion[]>(() => [fresh()]);
  const total = rows.reduce((s, r) => s + Math.max(0, ...r.levels.map((l) => Number(l.points.replace(",", ".")) || 0)), 0);

  function update(i: number, patch: Partial<Criterion>) {
    setRows((all) => all.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="criteria" value={JSON.stringify(rows)} />
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <input
                value={row.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder={`${labels.criterion} ${i + 1}`}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-[15px] font-semibold outline-none focus:border-ardoise"
                required
              />
              <input
                value={row.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="…"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-[13.5px] outline-none focus:border-ardoise"
              />
            </div>
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows((all) => all.filter((_, k) => k !== i))}
                className="rounded-md p-2 text-slate-400 hover:bg-terracotta-50 hover:text-terracotta-600"
                aria-label="✕"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {row.levels.map((lvl, j) => (
              <div key={j} className="w-36 shrink-0 rounded-lg bg-slate-50 p-2">
                <input
                  value={lvl.title}
                  onChange={(e) => update(i, { levels: row.levels.map((l, k) => (k === j ? { ...l, title: e.target.value } : l)) })}
                  placeholder={labels.level}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-semibold outline-none focus:border-ardoise"
                />
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    value={lvl.points}
                    onChange={(e) => update(i, { levels: row.levels.map((l, k) => (k === j ? { ...l, points: e.target.value } : l)) })}
                    inputMode="decimal"
                    className="num h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-ardoise"
                  />
                  <span className="text-[12px] text-slate-500">{labels.points}</span>
                  {row.levels.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => update(i, { levels: row.levels.filter((_, k) => k !== j) })}
                      className="ml-auto text-slate-400 hover:text-terracotta-600"
                      aria-label="✕"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {row.levels.length < 6 ? (
              <button
                type="button"
                onClick={() => update(i, { levels: [...row.levels, { title: "", points: "0" }] })}
                className="w-24 shrink-0 rounded-lg border border-dashed border-slate-300 text-[13px] font-semibold text-slate-500 hover:border-ardoise hover:text-ardoise"
              >
                {labels.addLevel}
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRows((all) => [...all, fresh()])}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline"
        >
          <Plus size={15} aria-hidden />
          {labels.addCriterion}
        </button>
        <span className="num text-[14px] font-bold text-slate-600">
          {labels.total}: {total} {labels.points}
        </span>
      </div>
    </div>
  );
}
