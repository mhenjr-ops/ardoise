// Reads a university's course list (Excel or CSV, French or English headers) into rows for
// catalogue_import: one row per course and department.
import { normalizeHeader } from "./roster";

export type CatalogueRow = {
  code: string;
  title: string;
  level: string;
  semester: string;
  credits: string;
  school: string;
  department: string;
};

export type CatalogueColumn = "code" | "title" | "level" | "semester" | "credits" | "school" | "department";
type Cell = string | number | boolean | Date | null | undefined;

const PATTERNS: Array<[CatalogueColumn, RegExp]> = [
  ["code", /^(course ?code|code( du cours| de l ue| ue| de la matiere)?|ue code|course ?(no|number)|numero du cours)$/],
  ["title", /^(course ?title|course ?name|course|title|titre( du cours| de l ue)?|intitules?( du cours| de l ue)?|libelles?( du cours| de l ue)?|designation( du cours)?|cours|matiere|nom du cours|moodle course name)$/],
  ["level", /^(level|niveau|year|annee|year of study|annee d etudes?|class|classe|cycle)$/],
  ["semester", /^(semester|semestre|sem|term|trimestre)$/],
  ["credits", /^(credits?|credit values?|cv|ects|credit units?|nombre de credits|nb credits|credits ects)$/],
  ["school", /^(school|faculty|faculte|ecole|institute|institut|college|etablissement|top category|faculty ?\/ ?school|faculte ?\/ ?ecole)$/],
  ["department", /^(departments?|departements?|dept|depts)$/],
];

export function detectCatalogueColumns(headers: unknown[]): Partial<Record<CatalogueColumn, number>> {
  const cols: Partial<Record<CatalogueColumn, number>> = {};
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (!n) return;
    for (const [key, re] of PATTERNS) {
      if (cols[key] === undefined && re.test(n)) {
        cols[key] = i;
        return;
      }
    }
  });
  return cols;
}

const text = (c: Cell) => (c instanceof Date ? "" : String(c ?? "").replace(/\s+/g, " ").trim());

/** "First Semester", "S2", "Semestre 1", "2nd" → "1" or "2"; anything else → "". */
export function semesterOf(c: Cell): string {
  const n = normalizeHeader(c);
  if (!n) return "";
  if (/\b(first|premier|premiere|1er|1st|one|un)\b/.test(n)) return "1";
  if (/\b(second|deuxieme|2nd|2e|2eme|two|deux)\b/.test(n)) return "2";
  const d = n.match(/(?:^|\D)([12])(?:\D|$)/);
  return d ? d[1] : "";
}

/** Credits as written ("3", "3.0", "3,5"); anything else → "". */
export function creditsOf(c: Cell): string {
  const s = text(c).replace(",", ".");
  return /^\d{1,2}(\.\d)?$/.test(s) ? s : "";
}

/**
 * Finds the header row (within the first 15 rows; it must name a code and a title) and reads
 * every course below it. A department cell may list several departments, separated by ; or |.
 */
export function catalogueFromTable(table: Cell[][]): { rows: CatalogueRow[]; columns: Partial<Record<CatalogueColumn, number>> } {
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const cols = detectCatalogueColumns(table[i] ?? []);
    if (cols.code === undefined || cols.title === undefined) continue;
    const get = (r: Cell[], k: CatalogueColumn) => (cols[k] === undefined ? "" : text(r[cols[k]!]));
    const rows: CatalogueRow[] = [];
    for (const r of table.slice(i + 1)) {
      const code = get(r, "code").replace(/\s+/g, "").toUpperCase();
      const title = get(r, "title");
      if (!code || code.length > 40 || !title) continue;
      const base = {
        code,
        title: title.slice(0, 300),
        level: get(r, "level").slice(0, 40),
        semester: cols.semester === undefined ? "" : semesterOf(r[cols.semester]),
        credits: cols.credits === undefined ? "" : creditsOf(r[cols.credits]),
        school: get(r, "school").slice(0, 200),
      };
      const deps = get(r, "department")
        .split(/[;|]/)
        .map((d) => d.trim())
        .filter(Boolean);
      for (const department of deps.length ? deps : [""]) rows.push({ ...base, department: department.slice(0, 200) });
    }
    return { rows, columns: cols };
  }
  return { rows: [], columns: {} };
}

/** Reads every sheet of a workbook and keeps the ones that look like course lists. */
export function catalogueFromWorkbook(sheets: Array<{ name: string; data: Cell[][] }>) {
  const rows: CatalogueRow[] = [];
  let columns: Partial<Record<CatalogueColumn, number>> = {};
  for (const s of sheets) {
    const got = catalogueFromTable(s.data);
    if (!got.rows.length) continue;
    rows.push(...got.rows);
    if (Object.keys(got.columns).length > Object.keys(columns).length) columns = got.columns;
  }
  return {
    rows,
    columns,
    courses: new Set(rows.map((r) => r.code)).size,
    departments: new Set(rows.filter((r) => r.department).map((r) => `${r.school.toLowerCase()}|${r.department.toLowerCase()}`)).size,
  };
}
