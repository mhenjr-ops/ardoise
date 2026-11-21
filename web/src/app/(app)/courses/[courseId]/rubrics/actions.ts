"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import type { RubricCriterion } from "@/lib/types";

function clean(raw: unknown): RubricCriterion[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RubricCriterion[] = [];
  for (const [i, c] of raw.entries()) {
    const title = String(c?.title ?? "").trim().slice(0, 120);
    const levels = Array.isArray(c?.levels) ? c.levels : [];
    const cleanLevels = levels
      .map((l: { title?: unknown; points?: unknown }, j: number) => ({
        id: `l${j + 1}`,
        title: String(l?.title ?? "").trim().slice(0, 60),
        points: Math.max(0, Math.min(1000, Number(String(l?.points ?? "0").replace(",", ".")) || 0)),
      }))
      .filter((l: { title: string }) => l.title);
    if (!title || cleanLevels.length < 2) continue;
    out.push({ id: `c${i + 1}`, title, description: String(c?.description ?? "").trim().slice(0, 300), levels: cleanLevels });
  }
  return out.length ? out : null;
}

export async function createRubric(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const back = `/courses/${courseId}/rubrics`;
  const title = String(formData.get("title") ?? "").trim();
  let criteria: RubricCriterion[] | null = null;
  try {
    criteria = clean(JSON.parse(String(formData.get("criteria") ?? "[]")));
  } catch {
    criteria = null;
  }
  if (!title || !criteria) redirect(`${back}?error=invalid`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("rubrics").insert({ course_id: courseId, title, criteria });
  if (error) redirect(`${back}?error=forbidden`);
  revalidatePath(back);
  redirect(`${back}?ok=1`);
}

export async function deleteRubric(formData: FormData) {
  const courseId = String(formData.get("course_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const { supabase } = await actionSession();
  await supabase.from("rubrics").delete().eq("id", id);
  revalidatePath(`/courses/${courseId}/rubrics`);
}
