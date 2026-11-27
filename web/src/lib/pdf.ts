import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { Locale, Messages } from "@/lib/i18n/messages";
import type { Decision, UEResult } from "@/lib/lmd";
import { formatDate, formatScore } from "@/lib/format";
import type { DraftTranscript } from "@/lib/draft-transcript";

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 36;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.85, 0.88, 0.91);
const BRAND = rgb(0.055, 0.486, 0.4);
const SHADE = rgb(0.95, 0.96, 0.97);

/** Standard PDF fonts only cover Latin-1; replace anything else so the file never fails to build. */
function makeSafe(font: PDFFont) {
  const cache = new Map<string, string>();
  const fallback: Record<string, string> = { "≥": ">=", "≤": "<=", "→": "->", "✓": "v", "’": "'", "“": '"', "”": '"', " ": " ", " ": " " };
  return (text: string) =>
    [...text]
      .map((ch) => {
        if (cache.has(ch)) return cache.get(ch) as string;
        let out = ch;
        try {
          font.encodeText(ch);
        } catch {
          out = fallback[ch] ?? "?";
        }
        cache.set(ch, out);
        return out;
      })
      .join("");
}

type Fonts = { regular: PDFFont; bold: PDFFont; safe: (s: string) => string };

async function fonts(doc: PDFDocument): Promise<Fonts> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { regular, bold, safe: makeSafe(regular) };
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Column = { header: string; width: number; align?: "left" | "center" | "right" };
type Cell = { text: string; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number };

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    public doc: PDFDocument,
    public f: Fonts,
    public size: [number, number],
  ) {
    this.newPage();
  }
  get width() {
    return this.size[0] - MARGIN * 2;
  }
  newPage() {
    this.page = this.doc.addPage(this.size);
    this.y = this.size[1] - MARGIN;
  }
  ensure(height: number, onNewPage?: () => void) {
    if (this.y - height < MARGIN + 24) {
      this.newPage();
      onNewPage?.();
    }
  }
  text(s: string, opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 10;
    this.page.drawText(this.f.safe(s), {
      x: opts.x ?? MARGIN,
      y: this.y - size,
      size,
      font: opts.bold ? this.f.bold : this.f.regular,
      color: opts.color ?? INK,
    });
    this.y -= size + (opts.gap ?? 4);
  }
  paragraph(s: string, size = 9, color = MUTED) {
    for (const line of wrap(this.f.safe(s), this.f.regular, size, this.width)) this.text(line, { size, color, gap: 3 });
  }
  rule(color = RULE) {
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.6, color });
    this.y -= 6;
  }
  table(columns: Column[], rows: Cell[][], size = 8.5, shadeRows: Set<number> = new Set()) {
    const rowH = size + 7;
    const drawHeader = () => {
      this.page.drawRectangle({ x: MARGIN, y: this.y - rowH, width: this.width, height: rowH, color: SHADE });
      let x = MARGIN;
      for (const c of columns) {
        this.cell(x, c, { text: c.header, bold: true }, size, rowH);
        x += c.width;
      }
      this.y -= rowH;
    };
    drawHeader();
    rows.forEach((row, i) => {
      this.ensure(rowH, drawHeader);
      if (shadeRows.has(i)) {
        this.page.drawRectangle({ x: MARGIN, y: this.y - rowH, width: this.width, height: rowH, color: rgb(0.975, 0.98, 0.985) });
      }
      let x = MARGIN;
      columns.forEach((c, j) => {
        this.cell(x, c, row[j] ?? { text: "" }, size, rowH);
        x += c.width;
      });
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - rowH },
        end: { x: MARGIN + this.width, y: this.y - rowH },
        thickness: 0.4,
        color: RULE,
      });
      this.y -= rowH;
    });
    this.y -= 6;
  }
  private cell(x: number, c: Column, cell: Cell, size: number, rowH: number) {
    const font = cell.bold ? this.f.bold : this.f.regular;
    const indent = cell.indent ?? 0;
    const text = fit(this.f.safe(cell.text), font, size, c.width - 6 - indent);
    const w = font.widthOfTextAtSize(text, size);
    const tx = c.align === "right" ? x + c.width - 3 - w : c.align === "center" ? x + (c.width - w) / 2 : x + 3 + indent;
    this.page.drawText(text, { x: tx, y: this.y - rowH + 5, size, font, color: cell.color ?? INK });
  }
  footer(label: string) {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const s = this.f.safe(`${label} · ${i + 1}/${pages.length}`);
      p.drawText(s, { x: MARGIN, y: MARGIN - 14, size: 7.5, font: this.f.regular, color: MUTED });
    });
  }
}

const statusColor = (s: UEResult["status"]) =>
  s === "validated" ? INK : s === "compensated" ? rgb(0.71, 0.45, 0.04) : s === "failed" ? rgb(0.73, 0.11, 0.11) : MUTED;

function policyLine(t: Messages, locale: Locale, policy: Record<string, unknown> | null) {
  if (!policy) return "";
  const p = policy as { pass_mark?: number; ue_compensation?: boolean; elimination_mark?: number; resit_rule?: "replace" | "max"; component_weights?: Record<string, number> };
  const w = p.component_weights ?? {};
  return [
    `${t.lmd.passMark}: ${formatScore(locale, Number(p.pass_mark ?? 10))}`,
    `${t.lmd.compensation}: ${p.ue_compensation ? (locale === "fr" ? "oui" : "yes") : locale === "fr" ? "non" : "no"}${p.ue_compensation ? ` (${t.lmd.eliminationMark.split("(")[0].trim()}: ${formatScore(locale, Number(p.elimination_mark ?? 0))})` : ""}`,
    `${t.lmd.resitRule}: ${t.lmd.resitRules[p.resit_rule ?? "replace"]}`,
    `CC/TP/Exam: ${w.cc ?? 0}/${w.tp ?? 0}/${w.exam ?? 0}`,
  ].join(" · ");
}

export type PvInput = {
  t: Messages;
  locale: Locale;
  institution: string;
  programme: string;
  level: string;
  semester: string;
  year: string;
  status: string;
  policy: Record<string, unknown> | null;
  ues: Array<{ id: string; code: string; credits: number }>;
  results: Array<{
    student_name: string;
    ue_results: UEResult[];
    semester_average: number | null;
    credits_earned: number;
    credits_total: number;
    decision: Decision;
  }>;
  adjustments: Array<{ student: string; ue: string; bonus: number; reason: string }>;
  date: string;
};

/** Procès-verbal de délibération: one row per student, one column per UE. */
export async function buildPvPdf(input: PvInput): Promise<Uint8Array> {
  const { t, locale } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`PV ${input.programme} ${input.level} ${input.semester}`);
  doc.setProducer("Ardoise");
  const f = await fonts(doc);
  const w = new Writer(doc, f, A4_LANDSCAPE);

  w.text(input.institution.toUpperCase(), { size: 11, bold: true, color: MUTED });
  w.text(locale === "fr" ? "PROCÈS-VERBAL DE DÉLIBÉRATION" : "DELIBERATION MINUTES", { size: 16, bold: true, gap: 6 });
  w.text(`${input.programme} · ${t.lmd.level} ${input.level} · ${input.semester} · ${input.year}`, { size: 10.5 });
  w.text(`${t.lmd.status[input.status as "draft" | "locked" | "published"] ?? input.status} · ${input.date}`, { size: 9, color: MUTED });
  w.paragraph(policyLine(t, locale, input.policy), 8);
  w.y -= 4;

  const n = Math.max(input.ues.length, 1);
  const fixed = 24 + 150 + 46 + 50 + 112;
  const ueWidth = Math.max(34, (w.width - fixed) / n);
  const size = n > 10 ? 7 : 8.5;
  const columns: Column[] = [
    { header: "N°", width: 24, align: "center" },
    { header: t.lmd.student, width: 150 },
    ...input.ues.map((u) => ({ header: `${u.code} (${u.credits})`, width: ueWidth, align: "center" as const })),
    { header: t.lmd.average, width: 46, align: "right" },
    { header: t.lmd.credits, width: 50, align: "center" },
    { header: t.lmd.decision, width: 112 },
  ];
  const rows: Cell[][] = input.results.map((r, i) => [
    { text: String(i + 1) },
    { text: r.student_name },
    ...input.ues.map((u) => {
      const ue = r.ue_results.find((x) => x.ue_id === u.id);
      if (!ue || ue.final === null) return { text: "ABS", color: MUTED };
      const suffix = ue.status === "compensated" ? " C" : ue.status === "failed" ? " NV" : "";
      return { text: `${formatScore(locale, ue.final)}${suffix}`, color: statusColor(ue.status) };
    }),
    { text: formatScore(locale, r.semester_average), bold: true },
    { text: `${r.credits_earned}/${r.credits_total}` },
    { text: t.lmd.decisions[r.decision], bold: true, color: r.decision === "resit" ? rgb(0.73, 0.11, 0.11) : r.decision === "incomplete" ? MUTED : BRAND },
  ]);
  w.table(columns, rows, size);

  const counts = (Object.keys(t.lmd.decisions) as Decision[])
    .map((d) => `${t.lmd.decisions[d]}: ${input.results.filter((r) => r.decision === d).length}`)
    .join(" · ");
  w.text(`${input.results.length} ${t.lmd.student.toLowerCase()}(s) · ${counts}`, { size: 9, bold: true });
  w.text("C = " + t.lmd.ueStatus.compensated + " · NV = " + t.lmd.ueStatus.failed + " · ABS = " + t.lmd.ueStatus.incomplete, {
    size: 7.5,
    color: MUTED,
    gap: 10,
  });

  if (input.adjustments.length) {
    w.ensure(40);
    w.text(t.lmd.jury, { size: 10, bold: true });
    w.table(
      [
        { header: t.lmd.student, width: 200 },
        { header: t.lmd.ue, width: 80 },
        { header: t.lmd.bonus, width: 60, align: "right" },
        { header: t.lmd.reason, width: w.width - 340 },
      ],
      input.adjustments.map((a) => [{ text: a.student }, { text: a.ue }, { text: `+${formatScore(locale, a.bonus)}` }, { text: a.reason }]),
      8,
    );
  }

  w.ensure(90);
  w.y -= 10;
  const roles = locale === "fr" ? ["Le Président du jury", "Les membres du jury", "Le Chef du service de la scolarité"] : ["Jury chair", "Jury members", "Registrar"];
  const colW = w.width / 3;
  roles.forEach((r, i) => {
    w.page.drawText(f.safe(r), { x: MARGIN + i * colW, y: w.y - 10, size: 9, font: f.bold, color: INK });
    w.page.drawLine({ start: { x: MARGIN + i * colW, y: w.y - 60 }, end: { x: MARGIN + i * colW + colW - 30, y: w.y - 60 }, thickness: 0.5, color: MUTED });
  });
  w.y -= 72;
  w.text(locale === "fr" ? `Fait à ____________________, le ${input.date}` : `Done at ____________________, on ${input.date}`, { size: 9, color: MUTED });
  w.footer(`${input.institution} · PV ${input.programme} ${input.level} ${input.semester} ${input.year}`);
  return doc.save();
}

/** The UE / course table shared by the official and the draft transcript. */
function transcriptTable(w: Writer, t: Messages, locale: Locale, ueResults: UEResult[]) {
  const columns: Column[] = [
    { header: "Code", width: 62 },
    { header: locale === "fr" ? "Unité d'enseignement / élément" : "Teaching unit / course", width: w.width - 62 - 46 - 40 - 56 - 92 },
    { header: t.lmd.credits, width: 46, align: "center" },
    { header: t.lmd.coefficient, width: 40, align: "center" },
    { header: "/20", width: 56, align: "right" },
    { header: locale === "fr" ? "Résultat" : "Result", width: 92 },
  ];
  const rows: Cell[][] = [];
  const shade = new Set<number>();
  for (const ue of ueResults) {
    shade.add(rows.length);
    rows.push([
      { text: ue.code, bold: true },
      { text: ue.title, bold: true },
      { text: String(ue.credits), bold: true },
      { text: "" },
      {
        text: ue.final === null ? "—" : `${formatScore(locale, ue.final)}${ue.bonus ? "*" : ""}`,
        bold: true,
        color: statusColor(ue.status),
      },
      { text: t.lmd.ueStatus[ue.status], bold: true, color: statusColor(ue.status) },
    ]);
    for (const c of ue.courses) {
      rows.push([
        { text: c.code, color: MUTED },
        { text: c.title, indent: 10 },
        { text: "" },
        { text: formatScore(locale, c.coefficient) },
        { text: formatScore(locale, c.mark) },
        { text: "" },
      ]);
    }
  }
  return { columns, rows, shade };
}

export type TranscriptPayload = {
  institution: string;
  student_name: string;
  student_email: string;
  programme: string;
  programme_code: string | null;
  level: string;
  semester: string;
  academic_year: string;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
  published_at: string | null;
};

/** Relevé de notes with a QR code that opens the public verification page. */
export async function buildTranscriptPdf(input: {
  t: Messages;
  locale: Locale;
  payload: TranscriptPayload;
  code: string;
  verifyUrl: string;
  issuedAt: string;
}): Promise<Uint8Array> {
  const { t, locale, payload: p } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`${locale === "fr" ? "Relevé de notes" : "Transcript"} — ${p.student_name}`);
  doc.setProducer("Ardoise");
  const f = await fonts(doc);
  const w = new Writer(doc, f, A4_PORTRAIT);

  const qrPng = await QRCode.toBuffer(input.verifyUrl, { margin: 1, width: 300, errorCorrectionLevel: "M" });
  const qr = await doc.embedPng(qrPng);
  const qrSize = 86;
  w.page.drawImage(qr, { x: MARGIN + w.width - qrSize, y: w.y - qrSize, width: qrSize, height: qrSize });

  w.text(p.institution.toUpperCase(), { size: 11, bold: true, color: MUTED });
  w.text(locale === "fr" ? "RELEVÉ DE NOTES" : "ACADEMIC TRANSCRIPT", { size: 18, bold: true, gap: 10 });
  const facts: Array<[string, string]> = [
    [t.lmd.student, p.student_name],
    [t.common.email, p.student_email],
    [t.lmd.programme, p.programme_code ? `${p.programme} (${p.programme_code})` : p.programme],
    [t.lmd.level, p.level],
    [t.lmd.semester, `${p.semester} · ${p.academic_year}`],
  ];
  for (const [k, v] of facts) {
    w.page.drawText(f.safe(`${k}`), { x: MARGIN, y: w.y - 9.5, size: 9, font: f.regular, color: MUTED });
    w.page.drawText(f.safe(fit(v, f.bold, 10, w.width - qrSize - 120)), { x: MARGIN + 100, y: w.y - 10, size: 10, font: f.bold, color: INK });
    w.y -= 15;
  }
  w.y = Math.min(w.y, w.size[1] - MARGIN - qrSize - 10) - 8;

  const { columns, rows, shade } = transcriptTable(w, t, locale, p.ue_results);
  w.table(columns, rows, 8.5, shade);
  if (p.ue_results.some((u) => u.bonus)) w.text(`* ${t.lmd.jury}`, { size: 7.5, color: MUTED });

  w.ensure(80);
  w.y -= 6;
  w.page.drawRectangle({ x: MARGIN, y: w.y - 58, width: w.width, height: 58, color: SHADE });
  const third = w.width / 3;
  const summary: Array<[string, string]> = [
    [t.lmd.average, `${formatScore(locale, p.semester_average)} /20`],
    [t.lmd.credits, `${p.credits_earned} / ${p.credits_total}`],
    [t.lmd.decision, t.lmd.decisions[p.decision]],
  ];
  summary.forEach(([k, v], i) => {
    w.page.drawText(f.safe(k), { x: MARGIN + 12 + i * third, y: w.y - 20, size: 8.5, font: f.regular, color: MUTED });
    const color = i < 2 ? INK : p.decision === "resit" ? rgb(0.73, 0.11, 0.11) : p.decision === "incomplete" ? MUTED : BRAND;
    w.page.drawText(f.safe(fit(v, f.bold, 13, third - 20)), { x: MARGIN + 12 + i * third, y: w.y - 40, size: 13, font: f.bold, color });
  });
  w.y -= 74;

  w.text(`${t.lmd.issuedOn} ${formatDate(locale, input.issuedAt)}`, { size: 9 });
  w.paragraph(
    locale === "fr"
      ? `Authenticité : scannez le code QR ou ouvrez ${input.verifyUrl} — code ${input.code}.`
      : `Authenticity: scan the QR code or open ${input.verifyUrl} — code ${input.code}.`,
    8.5,
  );
  w.footer(`${p.institution} · ${p.student_name} · ${input.code}`);
  return doc.save();
}


const DRAFT_RED = rgb(0.69, 0.16, 0.1);
const DRAFT_TINT = rgb(0.99, 0.95, 0.92);

/**
 * Draft transcript: the student's marks so far, per semester of their year. Stamped
 * PROVISOIRE / DRAFT across every page, with no verification code: it proves nothing and
 * says so. Semesters the jury has published show the official result.
 */
export async function buildDraftTranscriptPdf(input: {
  t: Messages;
  locale: Locale;
  draft: DraftTranscript;
  generatedAt: string;
}): Promise<Uint8Array> {
  const { t, locale, draft: p } = input;
  const fr = locale === "fr";
  const stamp = fr ? "PROVISOIRE" : "DRAFT";
  const doc = await PDFDocument.create();
  doc.setTitle(`${fr ? "Relevé de notes provisoire" : "Draft transcript"} — ${p.student_name}`);
  doc.setProducer("Ardoise");
  const f = await fonts(doc);
  const w = new Writer(doc, f, A4_PORTRAIT);

  // Banner first, so nobody mistakes it for the real thing even on a cropped photo.
  const bannerLines = wrap(
    f.safe(
      fr
        ? "Document non officiel. Les notes peuvent encore changer jusqu'à la délibération du jury. Ce relevé ne peut pas être vérifié et ne remplace pas le relevé officiel délivré par l'établissement."
        : "Not an official document. Marks may still change until the jury's deliberation. This transcript cannot be verified and does not replace the official transcript issued by the university.",
    ),
    f.regular,
    8.5,
    w.width - 24,
  );
  const bannerH = 26 + bannerLines.length * 11.5;
  w.page.drawRectangle({ x: MARGIN, y: w.y - bannerH, width: w.width, height: bannerH, color: DRAFT_TINT, borderColor: DRAFT_RED, borderWidth: 1 });
  w.page.drawText(f.safe(fr ? "RELEVÉ PROVISOIRE · NON OFFICIEL" : "DRAFT TRANSCRIPT · NOT OFFICIAL"), {
    x: MARGIN + 12, y: w.y - 17, size: 10, font: f.bold, color: DRAFT_RED,
  });
  bannerLines.forEach((line, i) => {
    w.page.drawText(line, { x: MARGIN + 12, y: w.y - 31 - i * 11.5, size: 8.5, font: f.regular, color: INK });
  });
  w.y -= bannerH + 16;

  w.text(p.institution.toUpperCase(), { size: 11, bold: true, color: MUTED });
  w.text(fr ? "RELEVÉ DE NOTES PROVISOIRE" : "DRAFT TRANSCRIPT", { size: 18, bold: true, gap: 10 });
  const facts: Array<[string, string]> = [
    [t.lmd.student, p.student_name],
    ...(p.matricule ? ([[fr ? "Matricule" : "Student ID", p.matricule]] as Array<[string, string]>) : []),
    [t.common.email, p.student_email],
    [t.lmd.programme, p.programme_code ? `${p.programme} (${p.programme_code})` : p.programme],
    [t.lmd.level, p.level],
    [fr ? "Année" : "Year", p.academic_year],
  ];
  for (const [k, v] of facts) {
    w.page.drawText(f.safe(k), { x: MARGIN, y: w.y - 9.5, size: 9, font: f.regular, color: MUTED });
    w.page.drawText(f.safe(fit(v, f.bold, 10, w.width - 110)), { x: MARGIN + 100, y: w.y - 10, size: 10, font: f.bold, color: INK });
    w.y -= 15;
  }
  w.y -= 8;

  if (p.semesters.length === 0) {
    w.paragraph(
      fr
        ? "Aucune unité d'enseignement n'est encore rattachée à votre parcours pour cette année."
        : "No teaching units are linked to your programme for this year yet.",
      10,
      INK,
    );
  }

  for (const sem of p.semesters) {
    w.ensure(90);
    w.y -= 4;
    const tag = sem.official
      ? `${fr ? "Officiel · publié le" : "Official · published"} ${sem.published_at ? formatDate(locale, sem.published_at) : ""}`.trim()
      : fr
        ? "Provisoire · notes à ce jour"
        : "Draft · marks so far";
    w.page.drawText(f.safe(`${t.lmd.semester} ${sem.label}`), { x: MARGIN, y: w.y - 13, size: 13, font: f.bold, color: INK });
    const tagW = f.bold.widthOfTextAtSize(f.safe(tag), 8.5);
    w.page.drawText(f.safe(tag), {
      x: MARGIN + w.width - tagW, y: w.y - 12, size: 8.5, font: f.bold, color: sem.official ? BRAND : DRAFT_RED,
    });
    w.y -= 22;

    const { columns, rows, shade } = transcriptTable(w, t, locale, sem.ue_results);
    w.table(columns, rows, 8.5, shade);
    if (sem.ue_results.some((u) => u.bonus)) w.text(`* ${t.lmd.jury}`, { size: 7.5, color: MUTED });

    w.ensure(56);
    w.page.drawRectangle({ x: MARGIN, y: w.y - 44, width: w.width, height: 44, color: SHADE });
    const third = w.width / 3;
    const prefix = sem.official ? "" : fr ? " (prov.)" : " (draft)";
    const summary: Array<[string, string]> = [
      [`${t.lmd.average}${prefix}`, `${formatScore(locale, sem.semester_average)} /20`],
      [t.lmd.credits, `${sem.credits_earned} / ${sem.credits_total}`],
      [`${t.lmd.decision}${prefix}`, t.lmd.decisions[sem.decision]],
    ];
    summary.forEach(([k, v], i) => {
      w.page.drawText(f.safe(k), { x: MARGIN + 12 + i * third, y: w.y - 16, size: 8, font: f.regular, color: MUTED });
      const color = i < 2 ? INK : sem.decision === "resit" ? rgb(0.73, 0.11, 0.11) : sem.decision === "incomplete" ? MUTED : BRAND;
      w.page.drawText(f.safe(fit(v, f.bold, 12, third - 20)), { x: MARGIN + 12 + i * third, y: w.y - 33, size: 12, font: f.bold, color });
    });
    w.y -= 58;
  }

  w.ensure(40);
  w.text(`${fr ? "Généré le" : "Generated on"} ${formatDate(locale, input.generatedAt)}`, { size: 9 });
  w.paragraph(
    fr
      ? "Une matière sans note compte comme « incomplète » ; une note manquante dans un devoir publié compte 0, comme lors de la délibération."
      : "A course with no mark counts as incomplete; a missing mark on published work counts as 0, as in the deliberation.",
    8,
  );
  w.footer(`${p.institution} · ${p.student_name} · ${stamp}`);

  // The stamp across every page, on top of everything, light enough to read through.
  const stampSize = 88;
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textW = f.bold.widthOfTextAtSize(stamp, stampSize);
    const angle = 35;
    const rad = (angle * Math.PI) / 180;
    page.drawText(stamp, {
      x: width / 2 - (Math.cos(rad) * textW) / 2 + (Math.sin(rad) * stampSize) / 3,
      y: height / 2 - (Math.sin(rad) * textW) / 2 - (Math.cos(rad) * stampSize) / 3,
      size: stampSize,
      font: f.bold,
      color: DRAFT_RED,
      opacity: 0.1,
      rotate: degrees(angle),
    });
  }
  return doc.save();
}
