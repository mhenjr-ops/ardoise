import "server-only";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { DraftSemester, DraftTranscript } from "@/lib/draft-transcript";
import { fit, fonts, wrap, type Fonts } from "@/lib/pdf";
import { UBA_LOGO_PNG_BASE64 } from "@/lib/transcripts/uba-logo";

/**
 * The University of Bamenda's transcript layout, as on its official "Student Transcript":
 * bilingual letterhead with the crest, then per academic year four tables side by side
 * (first semester, resit, second semester, resit) with Code, Title, CV, Marks /100, GD, GP, WP,
 * semester GPAs, the year's CGPA, and the grade system, classes and legends at the end.
 *
 * Only the draft uses it for now: stamped DRAFT on every page, no reference number, no
 * signature, no seal. Marks are Ardoise's /20 converted to /100.
 */

const PAGE: [number, number] = [841.89, 595.28]; // A4 landscape
const M = 24;
const INK = rgb(0.05, 0.07, 0.12);
const LINK = rgb(0.1, 0.3, 0.6);
const RED = rgb(0.75, 0.16, 0.12);
const GRID = rgb(0.16, 0.26, 0.45);
const YEAR_BAND = rgb(0.96, 0.76, 0.72);
const SEM_BAND = rgb(0.83, 0.92, 0.97);
const CGPA_BAND = rgb(0.62, 0.81, 0.92);
const GPA_CELL = rgb(0.97, 0.79, 0.82);
const PANEL = rgb(0.86, 0.93, 0.97);

/** UBa grade system (as printed on its transcripts). */
const SCALE: Array<{ grade: string; min: number; range: string; gp: number }> = [
  { grade: "A", min: 80, range: "(80-100)", gp: 4 },
  { grade: "B+", min: 70, range: "(70-79)", gp: 3.5 },
  { grade: "B", min: 60, range: "(60-69)", gp: 3 },
  { grade: "C+", min: 55, range: "(55-59)", gp: 2.5 },
  { grade: "C", min: 50, range: "(50-54)", gp: 2 },
  { grade: "D+", min: 45, range: "(45-49)", gp: 1.5 },
  { grade: "D", min: 40, range: "(40-44)", gp: 1 },
  { grade: "F", min: 0, range: "(0-39)", gp: 0 },
];
/** Credits count as earned from this mark (/100) up. */
const EARNED_FROM = 50;

const SEMESTER_NAMES = ["FIRST SEMESTER", "SECOND SEMESTER", "THIRD SEMESTER", "FOURTH SEMESTER"];

type Line = { code: string; title: string; cv: number; marks: number | null; grade: string; gp: number | null; wp: number | null };
type Totals = { cv: number; gp: number; wp: number; gpaCredits: number; earned: number };

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ""));
const n2 = (v: number) => v.toFixed(2);

export function ubaGrade(marks: number) {
  return SCALE.find((s) => marks >= s.min) ?? SCALE[SCALE.length - 1];
}

/** One semester as UBa rows: each teaching unit is a course line with its credit value. */
export function ubaLines(sem: DraftSemester): { lines: Line[]; totals: Totals } {
  const lines: Line[] = sem.ue_results.map((u) => {
    const cv = Number(u.credits) || 0;
    if (u.final === null) return { code: u.code, title: u.title, cv, marks: null, grade: "I", gp: null, wp: null };
    const marks = Math.round(Number(u.final) * 5 * 10) / 10; // /20 -> /100
    const g = ubaGrade(marks);
    return { code: u.code, title: u.title, cv, marks, grade: g.grade, gp: g.gp, wp: Math.round(cv * g.gp * 10) / 10 };
  });
  const totals: Totals = { cv: 0, gp: 0, wp: 0, gpaCredits: 0, earned: 0 };
  for (const l of lines) {
    totals.cv += l.cv;
    if (l.gp !== null) {
      totals.gp += l.gp;
      totals.wp += l.wp ?? 0;
      totals.gpaCredits += l.cv;
      if ((l.marks ?? 0) >= EARNED_FROM) totals.earned += l.cv;
    }
  }
  return { lines, totals };
}

const gpa = (t: { wp: number; gpaCredits: number }) => (t.gpaCredits > 0 ? t.wp / t.gpaCredits : null);

class Pdf {
  doc!: PDFDocument;
  f!: Fonts;
  logo!: PDFImage;
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  static async create() {
    const p = new Pdf();
    p.doc = await PDFDocument.create();
    p.f = await fonts(p.doc);
    p.logo = await p.doc.embedPng(Buffer.from(UBA_LOGO_PNG_BASE64, "base64"));
    return p;
  }
  newPage() {
    this.page = this.doc.addPage(PAGE);
    this.pages.push(this.page);
    this.y = PAGE[1] - M;
  }
  text(s: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; maxW?: number } = {}) {
    const font = opts.bold ? this.f.bold : this.f.regular;
    const t = opts.maxW ? fit(this.f.safe(s), font, size, opts.maxW) : this.f.safe(s);
    this.page.drawText(t, { x, y, size, font, color: opts.color ?? INK });
    return font.widthOfTextAtSize(t, size);
  }
  centered(s: string, cx: number, y: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    const font = opts.bold ? this.f.bold : this.f.regular;
    const t = this.f.safe(s);
    this.page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y, size, font, color: opts.color ?? INK });
  }
  box(x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>, border = GRID, bw = 0.5) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: border, borderWidth: bw });
  }
  font(bold?: boolean): PDFFont {
    return bold ? this.f.bold : this.f.regular;
  }
}

/** Bilingual letterhead with the crest; returns the y below it. */
function letterhead(p: Pdf, d: DraftTranscript) {
  const top = PAGE[1] - M;
  const leftC = M + 150;
  const rightC = PAGE[0] - M - 150;
  const left: Array<[string, number, boolean, ReturnType<typeof rgb>?]> = [
    ["REPUBLIC OF CAMEROON", 11, true],
    ["Peace - Work - Fatherland", 7.5, false],
    ["Ministry of Higher Education", 7.5, false],
    ["THE UNIVERSITY OF BAMENDA", 10, true],
    ["OFFICE OF THE REGISTRAR", 6.5, true],
    ["website: www.uniba.cm", 6, true, LINK],
    ["Email: info@uniba.cm", 6, true, LINK],
  ];
  const right: Array<[string, number, boolean]> = [
    ["REPUBLIQUE DU CAMEROUN", 11, true],
    ["Paix - Travail - Patrie", 7.5, false],
    ["Ministère de l'Enseignement Supérieur", 7.5, false],
    ["UNIVERSITE DE BAMENDA", 10, true],
    ["SECRETARIAT GENERAL", 6.5, true],
  ];
  let y = top - 12;
  for (const [s, size, bold, color] of left) {
    p.centered(s, leftC, y, size, { bold, color });
    y -= size + 3.2;
  }
  y = top - 12;
  for (const [s, size, bold] of right) {
    p.centered(s, rightC, y, size, { bold });
    y -= size + 3.2;
  }
  const logoH = 66;
  const logoW = (p.logo.width / p.logo.height) * logoH;
  p.page.drawImage(p.logo, { x: PAGE[0] / 2 - logoW / 2, y: top - 8 - logoH, width: logoW, height: logoH });
  p.centered("STUDENT TRANSCRIPT - DRAFT", PAGE[0] / 2, top - logoH - 24, 11, { bold: true, color: RED });

  let yy = top - logoH - 34;
  p.page.drawLine({ start: { x: M, y: yy }, end: { x: PAGE[0] - M, y: yy }, thickness: 0.8, color: INK });
  yy -= 11;
  const field = (label: string, value: string, x: number, y0: number, maxW: number) => {
    const w = p.text(`${label}: `, x, y0, 7.5);
    p.text(value, x + w, y0, 7.5, { bold: true, maxW: maxW - w });
  };
  const leftFields: Array<[string, string]> = [
    ["Student's Name", d.student_name.toUpperCase()],
    ["Degree in View", d.programme.toUpperCase()],
    ...(d.department ? ([["Department", d.department.toUpperCase()]] as Array<[string, string]>) : []),
    ...(d.faculty ? ([["Faculty/School", d.faculty.toUpperCase()]] as Array<[string, string]>) : []),
  ];
  const rightFields: Array<[string, string]> = [
    ["Registration Number", d.matricule ?? "-"],
    ["Level", d.level],
    ["Email", d.student_email],
  ];
  leftFields.forEach(([k, v], i) => field(k, v, M + 4, yy - i * 10.5, 470));
  rightFields.forEach(([k, v], i) => field(k, v, PAGE[0] / 2 + 150, yy - i * 10.5, PAGE[0] / 2 - 150 - M));
  yy -= Math.max(leftFields.length, rightFields.length) * 10.5 + 1;
  p.page.drawLine({ start: { x: M, y: yy }, end: { x: PAGE[0] - M, y: yy }, thickness: 0.8, color: INK });
  return yy - 6;
}

/** Continuation pages get a one-line header instead of the letterhead. */
function contHeader(p: Pdf, d: DraftTranscript) {
  const y = PAGE[1] - M - 10;
  p.text("THE UNIVERSITY OF BAMENDA - STUDENT TRANSCRIPT - DRAFT (continued)", M, y, 8, { bold: true, color: RED });
  const right = `${d.student_name.toUpperCase()} - ${d.matricule ?? ""}`;
  const w = p.f.bold.widthOfTextAtSize(p.f.safe(right), 8);
  p.text(right, PAGE[0] - M - w, y, 8, { bold: true });
  return y - 10;
}

const COLS = [
  { key: "code", label: "Code", w: 38 },
  { key: "title", label: "Title", w: 76.2 },
  { key: "cv", label: "CV", w: 14 },
  { key: "marks", label: "Marks", w: 22.5 },
  { key: "gd", label: "GD", w: 16 },
  { key: "gp", label: "GP", w: 14.5 },
  { key: "wp", label: "WP", w: 17 },
] as const;
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0);
const FS = 5.7;
const LH = 6.4;

function rowHeight(p: Pdf, l: Line) {
  const lines = Math.min(3, wrap(p.f.safe(l.title.toUpperCase()), p.f.regular, FS, COLS[1].w - 3).length);
  return Math.max(1, lines) * LH + 3;
}

/** Height a semester table needs (title row, column row, lines, total, GPA). */
function tableHeight(p: Pdf, lines: Line[], minRows: number) {
  const body = lines.reduce((s, l) => s + rowHeight(p, l), 0) + Math.max(0, minRows - lines.length) * (LH + 3);
  return 10 + 9 + body + 9 + 14;
}

function drawTable(p: Pdf, x: number, top: number, height: number, title: string, data: { lines: Line[]; totals: Totals } | null, gpaLabel: string) {
  // Title row and column headers
  p.box(x, top - 10, TABLE_W, 10, SEM_BAND);
  p.centered(title, x + TABLE_W / 2, top - 7.6, 7, { bold: true });
  let cx = x;
  for (const c of COLS) {
    p.box(cx, top - 19, c.w, 9, SEM_BAND);
    p.centered(c.label, cx + c.w / 2, top - 16.6, 5.8, { bold: true });
    cx += c.w;
  }
  const bodyTop = top - 19;
  const footer = 9 + 14;
  const bodyBottom = top - height + footer;
  // Column rules through the body
  cx = x;
  for (const c of COLS) {
    p.page.drawLine({ start: { x: cx, y: bodyTop }, end: { x: cx, y: bodyBottom }, thickness: 0.4, color: GRID });
    cx += c.w;
  }
  p.page.drawLine({ start: { x: x + TABLE_W, y: bodyTop }, end: { x: x + TABLE_W, y: bodyBottom }, thickness: 0.4, color: GRID });

  let y = bodyTop;
  for (const l of data?.lines ?? []) {
    const h = rowHeight(p, l);
    const mid = y - h / 2 - FS / 2 + 1;
    let px = x;
    const put = (s: string, w: number, align: "left" | "center" = "center", bold = false) => {
      if (align === "left") p.text(s, px + 1.5, mid, FS, { bold, maxW: w - 2 });
      else p.centered(s, px + w / 2, mid, FS, { bold });
      px += w;
    };
    put(l.code, COLS[0].w, "left", true);
    const tl = wrap(p.f.safe(l.title.toUpperCase()), p.f.regular, FS, COLS[1].w - 3).slice(0, 3);
    tl.forEach((t, i) => p.text(t, px + 1.5, y - 3 - FS - i * LH + 0.6, FS, { maxW: COLS[1].w - 2 }));
    px += COLS[1].w;
    put(n1(l.cv), COLS[2].w);
    put(l.marks === null ? "-" : n1(l.marks), COLS[3].w);
    put(l.grade, COLS[4].w, "center", l.grade === "I" || l.grade === "F");
    put(l.gp === null ? "" : n1(l.gp), COLS[5].w);
    put(l.wp === null ? "" : n1(l.wp), COLS[6].w);
    y -= h;
    p.page.drawLine({ start: { x, y }, end: { x: x + TABLE_W, y }, thickness: 0.3, color: GRID });
  }
  // Empty ruled lines down to the totals, like the printed form.
  while (y - (LH + 3) >= bodyBottom - 0.1) {
    y -= LH + 3;
    p.page.drawLine({ start: { x, y }, end: { x: x + TABLE_W, y }, thickness: 0.3, color: GRID });
  }
  // Total row
  const totalY = bodyBottom - 9;
  p.box(x, totalY, TABLE_W, 9, undefined);
  p.centered("Total", x + (COLS[0].w + COLS[1].w) / 2, totalY + 2.6, 6.2, { bold: true });
  if (data && data.lines.length) {
    let tx = x + COLS[0].w + COLS[1].w;
    p.centered(n1(data.totals.cv), tx + COLS[2].w / 2, totalY + 2.6, 6, { bold: true });
    tx += COLS[2].w + COLS[3].w + COLS[4].w;
    p.centered(n1(data.totals.gp), tx + COLS[5].w / 2, totalY + 2.6, 6, { bold: true });
    tx += COLS[5].w;
    p.centered(n1(data.totals.wp), tx + COLS[6].w / 2, totalY + 2.6, 6, { bold: true });
  }
  // GPA cell
  const gy = totalY - 14;
  const labelW = COLS[2].w + COLS[3].w + COLS[4].w + COLS[5].w;
  const gx = x + COLS[0].w + COLS[1].w;
  p.box(gx, gy, labelW, 14, GPA_CELL);
  p.box(gx + labelW, gy, COLS[6].w, 14, GPA_CELL);
  p.text(gpaLabel, gx + 2, gy + 8, 5.6, { bold: true });
  p.text("SEMESTER:", gx + 2, gy + 2.4, 5.6, { bold: true });
  const g = data ? gpa(data.totals) : null;
  if (g !== null) p.centered(n2(g), gx + labelW + COLS[6].w / 2, gy + 5, 6.2, { bold: true });
}

function legends(p: Pdf, top: number, totals: { attempted: number; earned: number; cgpa: number | null }) {
  const h = 90;
  const w1 = 238;
  const w2 = 230;
  const w3 = 220;
  const w4 = PAGE[0] - 2 * M - w1 - w2 - w3;
  const x1 = M;
  const x2 = x1 + w1;
  const x3 = x2 + w2;
  const x4 = x3 + w3;
  const head = (s: string, x: number, w: number) => {
    p.box(x, top - 10, w, 10, SEM_BAND);
    p.centered(s, x + w / 2, top - 7.6, 7, { bold: true });
  };
  head("Grade System", x1, w1);
  head("Degree Classification", x2, w2);
  head("Legends", x3, w3);
  p.box(x4, top - h, w4, h, PANEL);
  p.box(x1, top - h, w1, h - 10);
  p.box(x2, top - h, w2, h - 10);
  p.box(x3, top - h, w3, h - 10);

  // Grade system table
  const gx = [x1, x1 + 80, x1 + 190];
  let y = top - 18;
  p.centered("GRADE", gx[0] + 40, y, 6.2, { bold: true });
  p.centered("MARK", gx[1] + 55, y, 6.2, { bold: true });
  p.centered("GP", gx[2] + 24, y, 6.2, { bold: true });
  y -= 8.6;
  for (const s of SCALE) {
    p.text(s.grade, gx[0] + 3, y, 6.4);
    p.text(s.range, gx[1] + 3, y, 6.4);
    p.text(s.gp.toFixed(1), gx[2] + 3, y, 6.4);
    p.page.drawLine({ start: { x: x1, y: y - 2.2 }, end: { x: x1 + w1, y: y - 2.2 }, thickness: 0.3, color: GRID });
    y -= 8.2;
  }
  for (const vx of [gx[1], gx[2]]) {
    p.page.drawLine({ start: { x: vx, y: top - 21 }, end: { x: vx, y: top - h }, thickness: 0.3, color: GRID });
  }

  const block = (x: number, items: string[]) => {
    let yy = top - 18;
    for (const s of items) {
      p.text(s, x + 3, yy, 6.4);
      yy -= 8.4;
    }
  };
  block(x2, [
    "GPA / Class of Degree",
    "3.60 - 4.00 First Class",
    "3.00 - 3.59 Second Class - UD",
    "2.50 - 2.99 Second Class - LD",
    "2.25 - 2.49 Third Class - UD",
    "2.00 - 2.24 Pass",
    "UD (Upper Division),",
    "LD (Lower Division)",
  ]);
  block(x3, [
    "I = Incomplete (no mark yet)",
    "X = Absent",
    "* = Mark obtained after Resit",
    "GP = Grade Point",
    "GPA = Grade Point Average",
    "CGPA = Cumulative Grade Point Average",
    "WP = Weighted Point",
    "CV = Credit Value",
  ]);
  const sumY = top - 24;
  p.text(`Total Credits Attempted : ${n1(totals.attempted)}`, x4 + 6, sumY, 7, { bold: true });
  p.text(`Total Credits Earned : ${n1(totals.earned)}`, x4 + 6, sumY - 15, 7, { bold: true });
  p.text(`Cumulative GPA : ${totals.cgpa === null ? "-" : n2(totals.cgpa)}`, x4 + 6, sumY - 30, 7, { bold: true });
  return top - h;
}

/** Where the registrar's signature and seal would be: a plain statement that there are none. */
function draftNotice(p: Pdf, top: number, generatedAt: string) {
  const w = 430;
  const x = PAGE[0] - M - w;
  const lines = wrap(
    p.f.safe(
      "This is a DRAFT generated by Ardoise from the marks recorded so far. It is not signed or sealed by the Registrar, " +
        "it is not an official transcript and it cannot be verified. Marks may change until the jury's deliberation. " +
        "Marks are converted from /20 to /100.",
    ),
    p.f.regular,
    7,
    w - 16,
  );
  const h = 22 + lines.length * 8.6;
  p.page.drawRectangle({ x, y: top - h, width: w, height: h, color: rgb(0.99, 0.95, 0.93), borderColor: RED, borderWidth: 1 });
  p.text("DRAFT - NOT AN OFFICIAL TRANSCRIPT", x + 8, top - 13, 8.5, { bold: true, color: RED });
  lines.forEach((l, i) => p.text(l, x + 8, top - 24 - i * 8.6, 7));
  const d = new Date(generatedAt);
  const stamp = `Generated on ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Douala" })}`;
  p.text(stamp, M, top - 12, 7.5);
  return top - h;
}

export async function buildUbaDraftTranscriptPdf(input: { draft: DraftTranscript; generatedAt: string }): Promise<Uint8Array> {
  const d = input.draft;
  const p = await Pdf.create();
  p.doc.setTitle(`Student Transcript (DRAFT) - ${d.student_name}`);
  p.doc.setProducer("Ardoise");
  p.newPage();
  let y = letterhead(p, d);

  const sems = d.semesters.map((s) => ({ sem: s, ...ubaLines(s) }));
  const yearLabel = d.academic_year.replace("-", "/");

  // Semesters go two per band: [first, resit, second, resit].
  const gap = (PAGE[0] - 2 * M - TABLE_W * 4) / 3;
  const colX = [0, 1, 2, 3].map((i) => M + i * (TABLE_W + gap));
  for (let i = 0; i < Math.max(1, sems.length); i += 2) {
    const pair = [sems[i] ?? null, sems[i + 1] ?? null];
    const minRows = 4;
    const bandH = Math.max(...pair.map((s) => tableHeight(p, s?.lines ?? [], minRows)), tableHeight(p, [], minRows));
    if (y - (12 + bandH) < M + 20) {
      p.newPage();
      y = contHeader(p, d);
    }
    if (i === 0) {
      p.box(M, y - 11, PAGE[0] - 2 * M, 11, YEAR_BAND);
      p.centered(`ACADEMIC YEAR ${yearLabel}`, PAGE[0] / 2, y - 8.3, 7.5, { bold: true });
      y -= 12;
    }
    pair.forEach((s, j) => {
      const name = SEMESTER_NAMES[i + j] ?? `SEMESTER ${i + j + 1}`;
      const label = s ? `${name}${s.sem.official ? "" : " (DRAFT)"}` : name;
      drawTable(p, colX[j * 2], y, bandH, label, s ? { lines: s.lines, totals: s.totals } : null, `GPA ${name.split(" ")[0]}`);
      drawTable(p, colX[j * 2 + 1], y, bandH, "RESIT SEMESTER", null, "GPA RESIT");
    });
    y -= bandH + 4;
  }

  const year = sems.reduce(
    (a, s) => ({ wp: a.wp + s.totals.wp, gpaCredits: a.gpaCredits + s.totals.gpaCredits, cv: a.cv + s.totals.cv, earned: a.earned + s.totals.earned }),
    { wp: 0, gpaCredits: 0, cv: 0, earned: 0 },
  );
  const cgpa = gpa(year);
  // CGPA band + legends + the draft notice must stay together.
  if (y - 13 - 90 - 8 - 50 < M + 2) {
    p.newPage();
    y = contHeader(p, d);
  }
  p.box(M, y - 11, PAGE[0] - 2 * M, 11, CGPA_BAND);
  p.centered(`ACADEMIC YEAR (${yearLabel}) CGPA : ${cgpa === null ? "-" : n2(cgpa)}`, PAGE[0] / 2, y - 8.3, 7.5, { bold: true });
  y -= 13;
  y = legends(p, y, { attempted: year.cv, earned: year.earned, cgpa });
  draftNotice(p, y - 8, input.generatedAt);

  // Footer and the DRAFT stamp on every page.
  const total = p.pages.length;
  p.pages.forEach((page, i) => {
    page.drawText(p.f.safe(`${d.matricule ?? d.student_name} - Draft Transcript`), { x: M, y: M - 12, size: 9, font: p.f.regular, color: INK });
    const right = `Page ${i + 1} of ${total}`;
    page.drawText(right, { x: PAGE[0] - M - p.f.regular.widthOfTextAtSize(right, 9), y: M - 12, size: 9, font: p.f.regular, color: INK });
    const size = 150;
    const word = "DRAFT";
    const tw = p.f.bold.widthOfTextAtSize(word, size);
    const a = (28 * Math.PI) / 180;
    page.drawText(word, {
      x: PAGE[0] / 2 - (Math.cos(a) * tw) / 2 + Math.sin(a) * size * 0.35,
      y: PAGE[1] / 2 - (Math.sin(a) * tw) / 2 - Math.cos(a) * size * 0.35,
      size,
      font: p.f.bold,
      color: RED,
      opacity: 0.1,
      rotate: degrees(28),
    });
  });
  return p.doc.save();
}
