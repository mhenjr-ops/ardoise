import "server-only";
import { createHash } from "node:crypto";

export const FORM_B_MAX_BYTES = 8 * 1024 * 1024;

export type FormBRead = { sha256: string; text: string } | { error: "not_pdf" | "too_large" | "unreadable" | "no_text" };

/** Reads a Form B PDF's text (the portal prints it as a text PDF; a photo has no text to read). */
export async function readFormB(bytes: Uint8Array): Promise<FormBRead> {
  if (bytes.byteLength > FORM_B_MAX_BYTES) return { error: "too_large" };
  if (bytes.byteLength < 5 || Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") return { error: "not_pdf" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > 20) return { error: "unreadable" };
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = String(text ?? "").replace(/\u0000/g, "").slice(0, 200000);
    if (clean.replace(/\s+/g, "").length < 20) return { error: "no_text" };
    return { sha256, text: clean };
  } catch {
    return { error: "unreadable" };
  }
}
