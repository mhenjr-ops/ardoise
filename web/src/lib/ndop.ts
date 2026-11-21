/**
 * An original tile in the spirit of Ndop, the indigo royal cloth of the
 * Cameroon Grassfields: nested lozenges, moons, river zigzags and crossings,
 * separated by stitched lines. Drawn as chalk strokes so it sits on the slate.
 */
const TILE = [
  // nested lozenges
  "<path d='M24 5 L43 24 L24 43 L5 24 Z'/>",
  "<path d='M24 13 L35 24 L24 35 L13 24 Z'/>",
  "<circle cx='24' cy='24' r='1.6' fill='C'/>",
  // moon rings
  "<circle cx='72' cy='24' r='16'/>",
  "<circle cx='72' cy='24' r='9.5'/>",
  "<circle cx='72' cy='24' r='3' fill='C'/>",
  // river zigzags
  "<path d='M6 58 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6'/>",
  "<path d='M6 70 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6'/>",
  "<path d='M6 82 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6'/>",
  // crossing
  "<path d='M72 53 V91 M53 72 H91 M60 60 L84 84 M84 60 L60 84'/>",
  "<circle cx='72' cy='72' r='5'/>",
  // stitched seams
  "<path d='M48 0 V96 M0 48 H96' stroke-dasharray='2 4'/>",
].join("");

export function ndopTile(color: string, opacity: number, strokeWidth = 1.3): string {
  const body = TILE.replaceAll("fill='C'", `fill='${color}' stroke='none'`);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>` +
    `<g fill='none' stroke='${color}' stroke-opacity='${opacity}' fill-opacity='${opacity}' stroke-width='${strokeWidth}' stroke-linecap='round' stroke-linejoin='round'>` +
    body +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Chalk on slate (sidebar, hero, login). */
export const NDOP_CHALK = ndopTile("#f8f3ea", 0.13);
/** Ink on paper (empty states, subtle backgrounds). */
export const NDOP_INK = ndopTile("#1f3b36", 0.07);
/** White over a course colour (course covers and banners). */
export const NDOP_COVER = ndopTile("#ffffff", 0.2, 1.5);
