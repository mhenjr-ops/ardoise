"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, NotebookPen, Search, UserRound } from "lucide-react";
import type { SearchHit } from "@/app/api/search/route";

type Labels = {
  search: string;
  placeholder: string;
  empty: string;
  hint: string;
  close: string;
};

function noopSubscribe() {
  return () => {};
}

const icons = {
  course: BookOpen,
  assignment: NotebookPen,
  page: FileText,
  person: UserRound,
} as const;

export function CommandPalette({ labels, compact = false }: { labels: Labels; compact?: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const isMac = useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );

  const open = useCallback(() => {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { hits: SearchHit[] };
        setHits(json.hits);
        setActive(0);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const shown = q.trim().length < 2 ? [] : hits;

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    dialogRef.current?.close();
    setQ("");
    router.push(hit.href);
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={open}
          aria-label={labels.search}
          className="grid h-10 w-10 place-items-center rounded-full text-chalk/90 hover:bg-white/10"
        >
          <Search size={19} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-full border border-slate-300/80 bg-paper px-4 text-left text-[15px] text-slate-500 transition-colors hover:border-slate-400"
        >
          <Search size={17} aria-hidden className="text-slate-400" />
          <span className="flex-1 truncate">{labels.placeholder}</span>
          <span className="hidden items-center gap-1 sm:flex">
            <kbd className="rounded-md border border-slate-300 px-1.5 text-[11px] font-semibold text-slate-500">
              {isMac ? "⌘" : "Ctrl"}
            </kbd>
            <kbd className="rounded-md border border-slate-300 px-1.5 text-[11px] font-semibold text-slate-500">K</kbd>
          </span>
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-label={labels.search}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="mx-auto mt-[12vh] w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-paper p-0 text-slate-900 shadow-float backdrop:bg-ardoise-deep/55 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search size={18} aria-hidden className="text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(shown[active]);
              }
            }}
            placeholder={labels.placeholder}
            className="h-14 flex-1 bg-transparent text-[17px] outline-none placeholder:text-slate-400"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls="palette-results"
          />
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md border border-slate-300 px-1.5 text-[11px] font-semibold text-slate-500"
          >
            Esc
          </button>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">{labels.hint}</li>
          ) : shown.length === 0 && !loading ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">{labels.empty}</li>
          ) : (
            shown.map((hit, i) => {
              const Icon = icons[hit.kind];
              return (
                <li key={`${hit.kind}-${hit.id}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                      i === active ? "bg-ochre-50 text-slate-900" : "text-slate-700"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        i === active ? "bg-ochre-500 text-slate-950" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{hit.title}</span>
                      <span className="block truncate text-[13px] text-slate-500">{hit.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </dialog>
    </>
  );
}
