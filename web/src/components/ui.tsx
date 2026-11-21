import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { NDOP_INK } from "@/lib/ndop";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex select-none items-center justify-center gap-2 rounded-[10px] font-semibold transition-[background-color,box-shadow,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ardoise text-chalk shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-brand-600",
  accent: "bg-ochre-500 text-slate-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)] hover:bg-ochre-400",
  secondary: "border border-slate-300 bg-paper text-slate-800 hover:border-slate-400 hover:bg-white",
  ghost: "text-slate-700 hover:bg-slate-900/5",
  danger: "border border-terracotta-200 bg-paper text-terracotta-600 hover:bg-terracotta-50",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-[15px]",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size]);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ className, lifted = false, ...props }: ComponentProps<"div"> & { lifted?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-card)] border border-slate-200 bg-paper",
        lifted && "shadow-lift",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, action, icon }: { title: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
        {icon ? <span className="text-brand-500">{icon}</span> : null}
        {title}
      </h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
const fieldClass =
  "w-full rounded-[10px] border border-slate-300 bg-paper px-3 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:border-ardoise focus:outline-none focus:ring-4 focus:ring-ochre-200/60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldClass, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldClass, "min-h-28 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldClass, "h-10 pr-8", className)} {...props} />;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-[13px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------
const badgeTones = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-leaf-50 text-leaf-700 ring-leaf-100",
  accent: "bg-ochre-50 text-ochre-700 ring-ochre-100",
  warn: "bg-ochre-50 text-ochre-700 ring-ochre-100",
  danger: "bg-terracotta-50 text-terracotta-600 ring-terracotta-100",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-100",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ring-1 ring-inset",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[2rem] font-semibold leading-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[15px] text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-dashed border-slate-300 bg-paper px-6 py-12 text-center">
      <div aria-hidden className="absolute inset-0 opacity-70" style={{ backgroundImage: NDOP_INK }} />
      <div className="relative mx-auto max-w-sm text-[15px] text-slate-600">{children}</div>
      {action ? <div className="relative mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Flash({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (!error && !ok) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cx(
        "mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-[15px]",
        error
          ? "border-terracotta-200 bg-terracotta-50 text-terracotta-700"
          : "border-leaf-100 bg-leaf-50 text-leaf-700",
      )}
    >
      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-current" />
      <span>{error ?? ok}</span>
    </div>
  );
}

/** A collapsible panel for "create" forms, so lists stay the focus. */
export function Disclosure({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-[var(--radius-card)] border border-slate-200 bg-paper" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[15px] font-bold text-brand-700 [&::-webkit-details-marker]:hidden">
        {summary}
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-full bg-ochre-100 text-ochre-700 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="border-t border-slate-200/70 px-5 py-4">{children}</div>
    </details>
  );
}

/** Circular progress, 0..1. Ochre on sand. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  label,
  tone = "ochre",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  tone?: "ochre" | "chalk" | "leaf" | "terracotta";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const colors = {
    ochre: ["var(--color-slate-200)", "var(--color-ochre-500)"],
    chalk: ["rgb(255 255 255 / 0.25)", "#fff"],
    leaf: ["var(--color-slate-200)", "var(--color-leaf-500)"],
    terracotta: ["var(--color-slate-200)", "var(--color-terracotta-500)"],
  }[tone];
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[0]} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors[1]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
        />
      </svg>
      {label !== undefined ? <span className="num absolute text-[11px] font-bold">{label}</span> : null}
    </span>
  );
}

const avatarColors = ["#1f3b36", "#b4532a", "#283669", "#8d5b07", "#3d685e", "#74341b"];

export function initialsOf(name: string) {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: avatarColors[hash % avatarColors.length],
    fontSize: Math.max(10, size * 0.38),
  };
  return (
    <span
      title={name}
      style={style}
      className={cx("inline-grid shrink-0 place-items-center rounded-full font-bold text-chalk", className)}
    >
      {initialsOf(name)}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ink" | "ochre" | "terracotta" | "leaf";
}) {
  const color = { ink: "text-slate-900", ochre: "text-ochre-600", terracotta: "text-terracotta-500", leaf: "text-leaf-600" }[
    tone
  ];
  return (
    <div className="rounded-[var(--radius-card)] border border-slate-200 bg-paper px-5 py-4">
      <div className="text-[13px] font-semibold text-slate-500">{label}</div>
      <div className={cx("num mt-1 font-display text-3xl font-semibold", color)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[13px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-slate-300 bg-paper px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-500">
      {children}
    </kbd>
  );
}

/** Lozenge bullet, the Ndop diamond, used as a small status mark. */
export function Lozenge({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block h-2 w-2 rotate-45 rounded-[2px]", className ?? "bg-ochre-500")} />;
}
