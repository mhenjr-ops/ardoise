// Turns a registrar's export (Excel or CSV, any column order, French or English
// headers) into one row per student for import_roster.

export type RosterRow = {
  matricule: string;
  full_name: string;
  email: string;
  phone: string;
  programme: string;
  level: string;
  courses: string[];
};

export type ColumnKey = "matricule" | "name" | "first" | "last" | "email" | "phone" | "programme" | "level" | "courses" | "course_title";
/** A course named in the file: its code and, when the file has them, title, department, faculty or school, level. */
export type CourseInfo = { code: string; title: string; department?: string; faculty?: string; level?: string };
export type Columns = Partial<Record<ColumnKey, number>>;
type Cell = string | number | boolean | Date | null | undefined;

export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/n[°º]/g, "numero ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Checked in order; the first header that matches claims the column.
const PATTERNS: Array<[ColumnKey, RegExp]> = [
  ["course_title", /^(course ?title|course ?name|title|titre( du cours| de l ue)?|intitules?( du cours| de l ue| des cours)?|libelles?( du cours)?|designation( du cours)?|course description)$/],
  ["matricule", /^(numero )?(matricule|matric|matriculation)( (no|number|numero))?$|^(reg(istration)?|student) ?(no|number|id|numero)$|^mat$|^id etudiant$/],
  ["email", /^(e ?mail|courriel|mail|adresse (e ?mail|electronique))$/],
  ["phone", /^(phone|telephone|tel|mobile|whatsapp|portable|contact|numero de telephone|phone number)$/],
  ["first", /^(prenoms?|first ?names?|given names?)$/],
  ["last", /^(nom de famille|surname|last ?name|family name)$/],
  ["name", /^(noms?( et | )prenoms?|full ?name|name|names|nom complet|nom|student name|nom de l etudiant|etudiant|student|noms)$/],
  ["programme", /^(programme|program|filiere|option|specialite|speciality|specialty|parcours|department|departement)$/],
  ["level", /^(level|niveau|class|classe|year of study|cycle)$/],
  ["courses", /^(courses?|cours|codes?( (des )?(cours|ue))?|course codes?|code (cours|ue)|ue|ues|unites? d enseignement|matieres?|subjects?)$/],
];

export function detectColumns(headers: unknown[]): Columns {
  const cols: Columns = {};
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
  // "Nom" next to a "Prénom" column is the surname.
  if (cols.first !== undefined && cols.last === undefined && cols.name !== undefined) {
    cols.last = cols.name;
    delete cols.name;
  }
  return cols;
}

const text = (c: Cell) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? "").trim());

/** Course codes in a cell: "INF101, MAT102" or "INF101 MAT102" or "INF101/MAT102". */
export function splitCourses(cell: Cell): string[] {
  return text(cell)
    .split(/[,;/|\n]+|\s{1,}(?=[A-Za-z]{2,}\s?\d)/)
    .map((s) => s.replace(/\s+/g, "").toUpperCase())
    .filter((s) => /^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(s));
}

/** Finds the header row (within the first 15 rows) and groups the rest by matricule. */
export function rowsFromTable(table: Cell[][]): {
  rows: RosterRow[];
  columns: Columns;
  headerRow: number;
  registrations: number;
  courses: CourseInfo[];
} {
  let headerRow = -1;
  let columns: Columns = {};
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const c = detectColumns(table[i] ?? []);
    if (c.matricule !== undefined) {
      headerRow = i;
      columns = c;
      break;
    }
  }
  if (headerRow < 0) return { rows: [], columns: {}, headerRow, registrations: 0, courses: [] };

  const byMatricule = new Map<string, RosterRow>();
  const titles = new Map<string, string>();
  for (const raw of table.slice(headerRow + 1)) {
    const get = (k: ColumnKey) => (columns[k] === undefined ? "" : text(raw[columns[k]!]));
    const matricule = get("matricule").replace(/\s+/g, "").toUpperCase();
    if (matricule.length < 2 || matricule.length > 40) continue;
    const name = get("name") || [get("last"), get("first")].filter(Boolean).join(" ");
    const row = byMatricule.get(matricule) ?? { matricule, full_name: "", email: "", phone: "", programme: "", level: "", courses: [] };
    row.full_name ||= name.replace(/\s+/g, " ");
    row.email ||= get("email").toLowerCase();
    row.phone ||= get("phone");
    row.programme ||= get("programme");
    row.level ||= get("level");
    if (columns.courses !== undefined) {
      const codes = splitCourses(raw[columns.courses]);
      for (const c of codes) if (!row.courses.includes(c)) row.courses.push(c);
      // One course per row (the usual registration export): its title names the course.
      const title = get("course_title").replace(/\s+/g, " ");
      if (codes.length === 1 && title && !titles.has(codes[0])) titles.set(codes[0], title.slice(0, 200));
    }
    byMatricule.set(matricule, row);
  }
  const rows = [...byMatricule.values()];
  return {
    rows,
    columns,
    headerRow,
    registrations: rows.reduce((n, r) => n + r.courses.length, 0),
    courses: [...titles].map(([code, title]) => ({ code, title })),
  };
}

/** Minimal CSV reader: comma or semicolon (Excel in French uses ;), quoted fields. */
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// --- A courses sheet (no matricule): code, title, department, faculty or school, level -----

type CourseColumn = "code" | "title" | "department" | "faculty" | "level";
const COURSE_PATTERNS: Array<[CourseColumn, RegExp]> = [
  ["code", /^(course ?code|code( du cours| de l ue| ue)?|ue code|course ?no|course number)$/],
  ["title", /^(course ?title|course ?name|course|title|titre( du cours| de l ue)?|intitules?( du cours| de l ue)?|libelles?( du cours)?|designation( du cours)?|cours)$/],
  ["department", /^(department|departement|dept)$/],
  ["faculty", /^(faculty|faculte|school|ecole|institute|institut|college|faculty ?\/ ?school|faculte ?\/ ?ecole|faculty or school)$/],
  ["level", /^(level|niveau|year|annee)$/],
];

/** Reads a courses sheet: the header row (within the first 15 rows) must name a course code and a title. */
export function coursesFromTable(table: Cell[][]): CourseInfo[] {
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const cols: Partial<Record<CourseColumn, number>> = {};
    (table[i] ?? []).forEach((h, j) => {
      const n = normalizeHeader(h);
      if (!n) return;
      for (const [key, re] of COURSE_PATTERNS) {
        if (cols[key] === undefined && re.test(n)) {
          cols[key] = j;
          return;
        }
      }
    });
    if (cols.code === undefined || cols.title === undefined) continue;
    const byCode = new Map<string, CourseInfo>();
    for (const raw of table.slice(i + 1)) {
      const get = (k: CourseColumn) => (cols[k] === undefined ? "" : text(raw[cols[k]!]).replace(/\s+/g, " "));
      const code = get("code").replace(/\s+/g, "").toUpperCase();
      const title = get("title");
      if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(code) || !title) continue;
      if (!byCode.has(code)) {
        byCode.set(code, {
          code,
          title: title.slice(0, 200),
          ...(get("department") ? { department: get("department").slice(0, 200) } : {}),
          ...(get("faculty") ? { faculty: get("faculty").slice(0, 200) } : {}),
          ...(get("level") ? { level: get("level").slice(0, 20) } : {}),
        });
      }
    }
    return [...byCode.values()];
  }
  return [];
}

/**
 * A whole workbook (or one CSV): every sheet is read as students (it has a matricule column)
 * or as courses (a course code and a title). Students found on several sheets are merged.
 */
export function readWorkbook(sheets: Array<{ name: string; data: Cell[][] }>): {
  rows: RosterRow[];
  courses: CourseInfo[];
  registrations: number;
  columns: Columns;
  sheets: { students: string[]; courses: string[] };
} {
  const students = new Map<string, RosterRow>();
  const courses = new Map<string, CourseInfo>();
  let columns: Columns = {};
  const found = { students: [] as string[], courses: [] as string[] };
  for (const { name, data } of sheets) {
    const parsed = rowsFromTable(data);
    if (parsed.headerRow >= 0 && parsed.rows.length) {
      found.students.push(name);
      columns = { ...parsed.columns, ...columns };
      for (const r of parsed.rows) {
        const prev = students.get(r.matricule);
        if (!prev) students.set(r.matricule, r);
        else {
          for (const c of r.courses) if (!prev.courses.includes(c)) prev.courses.push(c);
          prev.full_name ||= r.full_name;
          prev.email ||= r.email;
          prev.phone ||= r.phone;
          prev.programme ||= r.programme;
          prev.level ||= r.level;
        }
      }
      for (const c of parsed.courses) if (!courses.has(c.code)) courses.set(c.code, c);
      continue;
    }
    const list = coursesFromTable(data);
    if (list.length) {
      found.courses.push(name);
      // A courses sheet says more about a course than a registration row does.
      for (const c of list) courses.set(c.code, { ...courses.get(c.code), ...c });
    }
  }
  const rows = [...students.values()];
  return {
    rows,
    courses: [...courses.values()],
    registrations: rows.reduce((n, r) => n + r.courses.length, 0),
    columns,
    sheets: found,
  };
}

