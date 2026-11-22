"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: ReactNode; badge?: number };
export type NavCourse = { id: string; code: string; title: string; color: string; href?: string };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Main navigation on the slate sidebar (desktop). */
export function SidebarNav({ items, courses, coursesLabel }: { items: NavItem[]; courses: NavCourse[]; coursesLabel: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                  active ? "bg-chalk text-ardoise" : "text-chalk/80 hover:bg-white/[0.07] hover:text-chalk"
                }`}
              >
                <span className={active ? "text-ochre-600" : "text-chalk/60 group-hover:text-chalk/90"}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span
                    className={`num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-extrabold ${
                      active ? "bg-ardoise text-chalk" : "bg-ochre-500 text-slate-950"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {courses.length ? (
        <div>
          <p className="px-3 pb-2 text-[12.5px] font-semibold text-chalk/45">{coursesLabel}</p>
          <ul className="space-y-0.5">
            {courses.map((c) => {
              const href = c.href ?? `/courses/${c.id}`;
              const active = isActive(pathname, href);
              return (
                <li key={c.id}>
                  <Link
                    href={href}
                    title={c.title}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors ${
                      active ? "bg-white/[0.09] text-chalk" : "text-chalk/70 hover:bg-white/[0.06] hover:text-chalk"
                    }`}
                  >
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ backgroundColor: c.color }} />
                    <span className="num font-bold">{c.code}</span>
                    <span className="truncate text-chalk/50">{c.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

/** Bottom tab bar on phones. */
export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md justify-around">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-semibold ${
                  active ? "text-ardoise" : "text-slate-500"
                }`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${active ? "bg-ochre-100 text-ochre-700" : ""}`}>
                  {item.icon}
                </span>
                {item.label}
                {item.badge ? (
                  <span className="num absolute right-[22%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-terracotta-500 px-1 text-[10px] font-extrabold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
