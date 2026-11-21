"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the page every few seconds while a check-in code is open. */
export function LiveRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

/** Sets every student in the roll to "present". */
export function MarkAllPresent({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        const form = e.currentTarget.closest("form");
        form?.querySelectorAll<HTMLInputElement>('input[type="radio"][value="present"]').forEach((r) => {
          r.checked = true;
        });
      }}
      className="rounded-full border border-slate-300 bg-paper px-3 py-1.5 text-[13.5px] font-semibold text-slate-700 hover:border-ardoise"
    >
      {label}
    </button>
  );
}
