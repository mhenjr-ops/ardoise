import type { Messages } from "@/lib/i18n/messages";

const KEYS = ["added", "addedTeach", "saved", "retiredOk", "restoredOk"] as const;

/** The confirmation for ?ok=… after a catalogue form. */
export function catalogueFlash(t: Messages, ok: string | string[] | undefined): string | null {
  const k = KEYS.find((x) => x === ok);
  return k ? t.catalogue[k] : null;
}
