"use client";

import { useState } from "react";
import type { RubricCriterion, RubricRatings } from "@/lib/types";

/** Pick one level per criterion; shows the mark it adds up to as you go. */
export function RubricScorer({
  criteria,
  initial,
  pointsPossible,
  locale,
  labels,
}: {
  criteria: RubricCriterion[];
  initial: RubricRatings;
  pointsPossible: number;
  locale: "fr" | "en";
  labels: { total: string; points: string; comment: string };
}) {
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.level])),
  );
  const max = criteria.reduce((s, c) => s + Math.max(0, ...c.levels.map((l) => Number(l.points))), 0);
  const earned = criteria.reduce((s, c) => {
    const lvl = c.levels.find((l) => l.id === picked[c.id]);
    return s + (lvl ? Number(lvl.points) : 0);
  }, 0);
  const mark = max > 0 ? Math.round((earned / max) * pointsPossible * 100) / 100 : 0;
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 });
  const complete = criteria.every((c) => picked[c.id]);

  return (
    <div className="space-y-4">
      {criteria.map((c) => (
        <fieldset key={c.id} className="rounded-xl border border-slate-200 bg-paper">
          <legend className="sr-only">{c.title}</legend>
          <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
            <p className="text-[15px] font-bold text-slate-900">{c.title}</p>
            <p className="num text-[12.5px] font-semibold text-slate-500">
              {nf.format(Math.max(0, ...c.levels.map((l) => Number(l.points))))} {labels.points}
            </p>
          </div>
          {c.description ? <p className="px-4 text-[13px] text-slate-500">{c.description}</p> : null}
          <div className="grid gap-1.5 p-3" style={{ gridTemplateColumns: `repeat(${Math.min(c.levels.length, 4)}, minmax(0, 1fr))` }}>
            {c.levels.map((l) => {
              const on = picked[c.id] === l.id;
              return (
                <label
                  key={l.id}
                  className={`cursor-pointer rounded-lg border px-2 py-2 text-center transition-colors ${
                    on ? "border-ardoise bg-ardoise text-chalk" : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name={`crit_${c.id}`}
                    value={l.id}
                    checked={on}
                    onChange={() => setPicked((p) => ({ ...p, [c.id]: l.id }))}
                    className="sr-only"
                  />
                  <span className="block text-[12.5px] font-semibold leading-tight">{l.title}</span>
                  <span className={`num block text-[13px] font-extrabold ${on ? "text-ochre-300" : "text-slate-500"}`}>{nf.format(Number(l.points))}</span>
                </label>
              );
            })}
          </div>
          <div className="px-3 pb-3">
            <input
              name={`comment_${c.id}`}
              defaultValue={initial[c.id]?.comment ?? ""}
              placeholder={labels.comment}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13.5px] outline-none focus:border-ardoise"
            />
          </div>
        </fieldset>
      ))}
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${complete ? "bg-ochre-100" : "bg-slate-100"}`}>
        <span className="text-[14px] font-bold text-slate-700">{labels.total}</span>
        <span className="num font-display text-2xl font-semibold text-slate-900">
          {nf.format(mark)}
          <span className="text-[15px] text-slate-500"> / {nf.format(pointsPossible)}</span>
        </span>
      </div>
    </div>
  );
}
