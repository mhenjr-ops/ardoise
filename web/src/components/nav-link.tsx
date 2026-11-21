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
  icon,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
  variant?: "course" | "global" | "tab";
  icon?: ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "tab" || variant === "global") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14.5px] font-semibold transition-colors ${
          active ? "bg-ardoise text-chalk" : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
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
      className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-[14.5px] font-semibold transition-colors ${
        active ? "bg-paper text-slate-900 shadow-[0_1px_0_rgb(31_59_54/0.06)] ring-1 ring-slate-200" : "text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900"
      }`}
    >
      {icon ? <span className={active ? "text-ochre-600" : "text-slate-400"}>{icon}</span> : null}
      {children}
    </Link>
  );
}
