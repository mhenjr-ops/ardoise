"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { errorCode } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

/** The registrar's answer: confirmed, or corrections (what's wrong, what's missing, remarks). */
export async function answerReview(formData: FormData) {
  const token = text(formData, "token", 100);
  if (!/^[0-9a-f]{40,100}$/.test(token)) redirect("/");
  const back = `/review/${token}`;

  const flagged = formData
    .getAll("flag")
    .map(String)
    .filter((v) => UUID.test(v))
    .slice(0, 2000);
  const missing: Array<{ unit: string; text: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("missing:")) continue;
    const unit = key.slice("missing:".length);
    const lines = String(value)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (UUID.test(unit) && lines.length) missing.push({ unit, text: lines.join("\n").slice(0, 2000) });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("structure_review_answer", {
    p_token: token,
    p_name: text(formData, "name", 200),
    p_title: text(formData, "title", 200),
    p_confirm: formData.get("intent") === "confirm",
    p_flagged: flagged,
    p_missing: missing.slice(0, 100),
    p_notes: text(formData, "notes", 5000),
  });
  if (error) redirect(`${back}?error=${errorCode(error)}`);
  redirect(`${back}?sent=${data === "confirmed" ? "confirmed" : "changes"}`);
}
