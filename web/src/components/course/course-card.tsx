import Link from "next/link";
import type { ReactNode } from "react";
import { NDOP_COVER } from "@/lib/ndop";
import { ProgressRing } from "@/components/ui";

/** A course tile: course colour, chalk Ndop cover, code and title, a ring for progress. */
export function CourseCard({
  href,
  code,
  title,
  color,
  level,
  roleLabel,
  progress,
  progressLabel,
  footer,
}: {
  href: string;
  code: string;
  title: string;
  color: string;
  level?: string | null;
  roleLabel: string;
  progress?: number | null;
  progressLabel?: string;
  footer?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-paper transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative h-28 overflow-hidden" style={{ backgroundColor: color }}>
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: NDOP_COVER, backgroundSize: "84px 84px" }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-black/35 via-black/5 to-transparent" />
        <div className="relative flex h-full items-end justify-between p-4">
          <span className="num rounded-md bg-black/25 px-2 py-0.5 text-[13px] font-extrabold tracking-wide text-white backdrop-blur-sm">
            {code}
          </span>
          {progress !== undefined && progress !== null ? (
            <span className="rounded-full bg-black/25 p-0.5 text-white backdrop-blur-sm" title={progressLabel}>
              <ProgressRing value={progress} size={42} stroke={4} tone="chalk" label={`${Math.round(progress * 100)}%`} />
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-display text-[1.2rem] font-semibold leading-snug text-slate-900 group-hover:text-brand-600">
          {title}
        </h3>
        <p className="flex items-center gap-2 text-[13.5px] text-slate-500">
          <span>{roleLabel}</span>
          {level ? <span className="rounded-md bg-slate-100 px-1.5 text-[12px] font-bold text-slate-600">{level}</span> : null}
        </p>
        {footer ? <div className="mt-auto pt-1">{footer}</div> : null}
      </div>
    </Link>
  );
}
