import { inkOn, logoUrl, schoolColor, schoolInitials, type SchoolLook } from "@/lib/school-look";

/**
 * A university's mark: its logo on a white tile, or its initials on its colour. The same
 * square everywhere (sidebar, console, join page), so a logo added later simply takes its place.
 */
export function SchoolMark({ look, size = 40, className = "" }: { look: SchoolLook; size?: number; className?: string }) {
  const url = logoUrl(look.logo_path);
  const radius = Math.round(size * 0.24);
  if (url) {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-black/5 ${className}`}
        style={{ width: size, height: size, borderRadius: radius, padding: Math.round(size * 0.08) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a small public logo; no resizing service needed */}
        <img src={url} alt={look.name} className="h-full w-full object-contain" />
      </span>
    );
  }
  const text = schoolInitials(look);
  const bg = schoolColor(look);
  const scale = text.length <= 2 ? 0.42 : text.length === 3 ? 0.34 : text.length === 4 ? 0.28 : 0.22;
  return (
    <span
      role="img"
      aria-label={look.name}
      className={`inline-grid shrink-0 place-items-center font-display font-semibold tracking-tight ${className}`}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, color: inkOn(bg), fontSize: Math.round(size * scale) }}
    >
      {text.slice(0, 5)}
    </span>
  );
}
