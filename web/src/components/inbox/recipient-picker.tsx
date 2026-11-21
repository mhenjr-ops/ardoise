"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

export type Contact = { id: string; full_name: string; email: string; office: boolean; courses: string };

/** Pick one or more recipients; posts them as repeated "to" fields. */
export function RecipientPicker({
  contacts,
  initial,
  labels,
}: {
  contacts: Contact[];
  initial: string[];
  labels: { filter: string; office: string };
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) => `${c.full_name} ${c.email} ${c.courses}`.toLowerCase().includes(needle));
  }, [contacts, q]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosen = contacts.filter((c) => selected.has(c.id));

  return (
    <div className="rounded-xl border border-slate-300 bg-paper">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="to" value={id} />
      ))}
      {chosen.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 p-2">
          {chosen.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className="inline-flex items-center gap-1 rounded-full bg-ardoise px-3 py-1 text-[13px] font-semibold text-chalk"
            >
              {c.full_name || c.email}
              <span aria-hidden className="text-chalk/60">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <label className="flex items-center gap-2 border-b border-slate-200 px-3">
        <Search size={15} className="text-slate-400" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.filter}
          className="h-10 flex-1 bg-transparent text-[15px] outline-none"
        />
      </label>
      <ul className="max-h-64 overflow-y-auto p-1">
        {shown.map((c) => {
          const on = selected.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${on ? "bg-ochre-50" : "hover:bg-slate-50"}`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-ardoise bg-ardoise text-chalk" : "border-slate-300"}`}
                >
                  {on ? <Check size={13} aria-hidden /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{c.full_name || c.email}</span>
                  <span className="block truncate text-[12.5px] text-slate-500">{c.office ? labels.office : c.courses}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
