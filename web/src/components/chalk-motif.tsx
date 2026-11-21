import type { CSSProperties } from "react";

/**
 * A 3×3 Ndop-style panel drawn in chalk, stroke by stroke, once.
 * The spider at the centre is the Grassfields sign of wisdom.
 */
type Stroke = { d: string; accent?: boolean };

function lozenges(cx: number, cy: number, r: number): Stroke[] {
  return [r, r * 0.66, r * 0.33].map((s) => ({ d: `M${cx} ${cy - s} L${cx + s} ${cy} L${cx} ${cy + s} L${cx - s} ${cy} Z` }));
}

function rings(cx: number, cy: number, r: number): Stroke[] {
  return [r, r * 0.62, r * 0.25].map((s) => ({
    d: `M${cx - s} ${cy} a${s} ${s} 0 1 0 ${2 * s} 0 a${s} ${s} 0 1 0 ${-2 * s} 0`,
  }));
}

function zigzags(x: number, y: number, w: number, rows: number): Stroke[] {
  const out: Stroke[] = [];
  const step = w / 8;
  for (let r = 0; r < rows; r++) {
    let d = `M${x} ${y + r * 34}`;
    for (let i = 0; i < 8; i++) d += ` l${step} ${i % 2 === 0 ? 16 : -16}`;
    out.push({ d });
  }
  return out;
}

function crossing(cx: number, cy: number, r: number): Stroke[] {
  const k = r * 0.66;
  return [
    { d: `M${cx} ${cy - r} V${cy + r} M${cx - r} ${cy} H${cx + r}` },
    { d: `M${cx - k} ${cy - k} L${cx + k} ${cy + k} M${cx + k} ${cy - k} L${cx - k} ${cy + k}` },
    { d: `M${cx - 14} ${cy} a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0` },
  ];
}

function spider(cx: number, cy: number): Stroke[] {
  const legs: Stroke[] = [];
  for (const side of [-1, 1]) {
    for (const [dy, reach] of [
      [-30, 62],
      [-10, 74],
      [10, 74],
      [30, 62],
    ] as const) {
      const kx = cx + side * reach * 0.55;
      const ky = cy + dy - 26;
      legs.push({ d: `M${cx + side * 14} ${cy + dy * 0.4} L${kx} ${ky} L${cx + side * reach} ${cy + dy + 24}`, accent: true });
    }
  }
  return [
    { d: `M${cx - 18} ${cy} a18 22 0 1 0 36 0 a18 22 0 1 0 -36 0`, accent: true },
    { d: `M${cx - 10} ${cy - 34} a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0`, accent: true },
    ...legs,
  ];
}

function chain(x: number, y: number, h: number): Stroke[] {
  const out: Stroke[] = [];
  const s = h / 8;
  for (let i = 0; i < 4; i++) {
    const cy = y + s + i * 2 * s;
    out.push({ d: `M${x} ${cy - s} L${x + s} ${cy} L${x} ${cy + s} L${x - s} ${cy} Z` });
  }
  return out;
}

const STROKES: Stroke[] = [
  { d: "M200 0 V600 M400 0 V600 M0 200 H600 M0 400 H600" },
  ...lozenges(100, 100, 72),
  ...rings(300, 100, 70),
  ...zigzags(436, 52, 128, 4),
  ...crossing(100, 300, 70),
  ...spider(300, 304),
  ...chain(500, 220, 160),
  ...chain(470, 220, 160),
  ...chain(530, 220, 160),
  ...zigzags(36, 452, 128, 4),
  ...rings(300, 500, 62),
  ...lozenges(500, 500, 72),
];

export function ChalkMotif({
  className,
  animate = true,
  color = "#f8f3ea",
  accent = "#d98e04",
}: {
  className?: string;
  animate?: boolean;
  color?: string;
  accent?: string;
}) {
  return (
    <svg viewBox="-4 -4 608 608" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      {STROKES.map((s, i) => {
        const seam = i === 0;
        const style: CSSProperties | undefined = animate
          ? { strokeDasharray: 1, animation: `chalk 1.6s cubic-bezier(0.65,0,0.35,1) ${0.15 + i * 0.045}s both` }
          : undefined;
        return (
          <path
            key={i}
            d={s.d}
            pathLength={1}
            stroke={s.accent ? accent : color}
            strokeOpacity={seam ? 0.25 : s.accent ? 0.95 : 0.55}
            strokeWidth={seam ? 1.5 : s.accent ? 3 : 2.2}
            strokeDasharray={seam ? "0.004 0.012" : undefined}
            style={seam ? undefined : style}
          />
        );
      })}
    </svg>
  );
}
