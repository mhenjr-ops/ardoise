import { supabaseUrl } from "@/lib/env";

/** What it takes to draw a university's mark: its logo, or its initials on its colour. */
export type SchoolLook = {
  name: string;
  short_name?: string | null;
  brand_color?: string | null;
  logo_path?: string | null;
};

const SMALL_WORDS = new Set(["of", "the", "and", "for", "de", "du", "des", "la", "le", "les", "d", "l", "et", "en", "au", "aux"]);

/** The university's short name, or its initials (University of Buea → UB), at most four letters. */
export function schoolInitials(look: SchoolLook): string {
  const short = (look.short_name ?? "").trim();
  if (short) return short;
  const letters = look.name
    .replace(/[’']/g, " ")
    .split(/[\s,\-–.()]+/)
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return letters.slice(0, 4) || look.name.slice(0, 2).toUpperCase();
}

// Deep, quiet colours that sit well next to the slate and ochre, all readable under white text.
const PALETTE = ["#2f5d50", "#8d5b07", "#9a3f2a", "#3b4c86", "#4d6b2f", "#6a3e64", "#245e78", "#7a4a26"];

/** The university's own colour, or a steady one picked from its name. */
export function schoolColor(look: SchoolLook): string {
  const own = (look.brand_color ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(own)) return own.toLowerCase();
  let h = 0;
  for (const ch of look.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Dark or light text, whichever reads better on the colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? "#17201c" : "#ffffff";
}

/** Public address of a logo in the "brand" bucket. */
export function logoUrl(path?: string | null): string | null {
  return path ? `${supabaseUrl()}/storage/v1/object/public/brand/${path.split("/").map(encodeURIComponent).join("/")}` : null;
}
