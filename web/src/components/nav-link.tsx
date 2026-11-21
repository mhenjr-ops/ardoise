"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A link that highlights itself when its section is open. */
export function NavLink({
  href,
  children,
  exact = false,
  variant = "course",
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
  variant?: "course" | "global" | "tab";
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "global") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium ${
          active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
        }`}
      >
        {children}
      </Link>
    );
  }

  if (variant === "tab") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
          active ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900"
        }`}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm md:border-b-0 md:border-l-2 ${
        active
          ? "border-brand-600 font-semibold text-brand-700"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
