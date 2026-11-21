"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type CourseNavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

/** Course sections. Folds to icons on wide work screens (SpeedGrader) to give the work room. */
export function CourseNav({ items, label }: { items: CourseNavItem[]; label: string }) {
  const pathname = usePathname();
  const compact = pathname.endsWith("/grade");
  return (
    <nav
      aria-label={label}
      className={`-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1 md:sticky md:top-24 md:mx-0 md:mb-0 md:shrink-0 md:flex-col md:self-start md:overflow-visible md:px-0 ${
        compact ? "md:w-12" : "md:w-52"
      }`}
    >
      {items.map((n) => {
        const active = n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            title={n.label}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-[14.5px] font-semibold transition-colors ${
              active
                ? "bg-paper text-slate-900 shadow-[0_1px_0_rgb(31_59_54/0.06)] ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900"
            }`}
          >
            <span className={active ? "text-ochre-600" : "text-slate-400"}>{n.icon}</span>
            <span className={compact ? "md:sr-only" : undefined}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
