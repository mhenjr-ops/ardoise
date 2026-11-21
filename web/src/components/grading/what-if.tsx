"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

type Row = {
  id: string;
  href: string;
  title: string;
  component: string;
  weight: number;
  points: number;
  score: number | null;
  comment: string | null;
};

function average(rows: Row[], extra: Record<string, number>) {
  let total = 0;
  let weights = 0;
  for (const r of rows) {
    const s = r.score ?? extra[r.id];
    if (s === undefined || s === null || Number.isNaN(s) || r.weight <= 0 || r.points <= 0) continue;
    total += (s / r.points) * 20 * r.weight;
    weights += r.weight;
  }
  return weights ? Math.round((total / weights) * 100) / 100 : null;
}

/** The student's marks, with "what if" boxes on ungraded work and a live projected average. */
export function WhatIfGrades({
  rows,
  locale,
  labels,
}: {
  rows: Row[];
  locale: "fr" | "en";
  labels: { average: string; projected: string; note: string; title: string; help: string; reset: string; notGraded: string; feedback: string };
}) {
  const [extra, setExtra] = useState<Record<string, number>>({});
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 });
  const current = average(rows, {});
  const projected = average(rows, extra);
  const hasExtra = Object.keys(extra).length > 0;
  const tone = (v: number | null) => (v === null ? "text-slate-400" : v < 10 ? "text-terracotta-500" : "text-slate-900");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-slate-200 bg-paper px-5 py-4">
          <p className="text-[13px] font-semibold text-slate-500">{labels.average}</p>
          <p className={`num font-display text-4xl font-semibold ${tone(current)}`}>
            {current === null ? "—" : nf.format(current)}
            <span className="text-lg text-slate-400"> /20</span>
          </p>
          <p className="text-[12.5px] text-slate-500">{labels.note}</p>
        </div>
        <div className={`rounded-[var(--radius-card)] px-5 py-4 ${hasExtra ? "bg-ardoise text-chalk" : "border border-dashed border-slate-300 bg-paper"}`}>
          <div className="flex items-center justify-between">
            <p className={`text-[13px] font-semibold ${hasExtra ? "text-chalk/70" : "text-slate-500"}`}>{labels.projected}</p>
            {hasExtra ? (
              <button type="button" onClick={() => setExtra({})} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ochre-300 hover:underline">
                <RotateCcw size={12} aria-hidden />
                {labels.reset}
              </button>
            ) : null}
          </div>
          <p className={`num font-display text-4xl font-semibold ${hasExtra ? (projected !== null && projected < 10 ? "text-terracotta-300" : "text-ochre-300") : "text-slate-300"}`}>
            {projected === null ? "—" : nf.format(projected)}
            <span className={`text-lg ${hasExtra ? "text-chalk/50" : "text-slate-300"}`}> /20</span>
          </p>
          <p className={`text-[12.5px] ${hasExtra ? "text-chalk/60" : "text-slate-500"}`}>{labels.help}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-paper">
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={r.href} className="text-[15.5px] font-semibold text-slate-900 hover:text-brand-600">
                    {r.title}
                  </Link>
                  <p className="mt-0.5 flex gap-2 text-[12.5px] font-semibold text-slate-500">
                    <span>{r.component}</span>
                    <span className="num">×{nf.format(r.weight)}</span>
                  </p>
                </div>
                {r.score !== null ? (
                  <span className={`num font-display text-xl font-semibold ${(r.score / r.points) * 20 < 10 ? "text-terracotta-500" : "text-slate-900"}`}>
                    {nf.format(r.score)}
                    <span className="text-[14px] text-slate-400"> / {nf.format(r.points)}</span>
                  </span>
                ) : (
                  <label className="flex items-center gap-2">
                    <span className="text-[12.5px] font-semibold text-slate-400">{labels.notGraded}</span>
                    <input
                      inputMode="decimal"
                      placeholder="?"
                      aria-label={`${labels.title}: ${r.title}`}
                      value={extra[r.id] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(",", ".");
                        setExtra((prev) => {
                          const next = { ...prev };
                          const v = Number(raw);
                          if (raw === "" || Number.isNaN(v)) delete next[r.id];
                          else next[r.id] = Math.max(0, Math.min(r.points, v));
                          return next;
                        });
                      }}
                      className="num h-9 w-16 rounded-lg border border-dashed border-ochre-400 bg-ochre-50 text-center font-semibold outline-none focus:border-solid focus:border-ardoise"
                    />
                    <span className="num text-[13px] text-slate-400">/ {nf.format(r.points)}</span>
                  </label>
                )}
              </div>
              {r.comment ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[14px] text-slate-600">
                  <span className="font-semibold text-slate-700">{labels.feedback}: </span>
                  {r.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
