import { cx } from "@/components/ui";

/** The Ardoise mark: a slate with a chalk A and an ochre lozenge. */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={cx("shrink-0", className)}>
      <rect width="40" height="40" rx="10" fill="#1f3b36" />
      <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#f8f3ea" strokeOpacity="0.18" />
      <path d="M11.5 30 L20 9.5 L28.5 30" fill="none" stroke="#f8f3ea" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 22.5 H25" stroke="#f8f3ea" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="27.2" y="7.2" width="5.6" height="5.6" rx="1" transform="rotate(45 30 10)" fill="#d98e04" />
    </svg>
  );
}

export function Wordmark({ dark = false, size = "md" }: { dark?: boolean; size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size === "lg" ? 42 : 34} />
      <span
        className={cx(
          "font-display font-semibold tracking-tight",
          size === "lg" ? "text-[1.7rem]" : "text-[1.35rem]",
          dark ? "text-chalk" : "text-slate-900",
        )}
      >
        Ardoise
      </span>
    </span>
  );
}
