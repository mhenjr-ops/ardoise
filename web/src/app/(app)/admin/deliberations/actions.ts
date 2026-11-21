"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";
import { computeAndStore, loadDeliberation, one } from "@/lib/deliberation";
import { chunk, fetchAll } from "@/lib/fetch-all";
import type { TranscriptPayload } from "@/lib/pdf";
import type { Decision, UEResult } from "@/lib/lmd";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const detail = (id: string) => `/admin/deliberations/${id}`;

function codeFrom(e: unknown) {
  return errorCode({ message: e instanceof Error ? e.message : String(e) });
}

export async function createDeliberation(formData: FormData) {
  const programme = str(formData, "programme_id");
  const semester = str(formData, "semester_id");
  const level = str(formData, "level");
  if (!programme || !semester || !level) redirect("/admin/deliberations?error=invalid");
  const { supabase } = await actionSession();
  const { data, error } = await supabase
    .from("deliberations")
    .insert({ programme_id: programme, semester_id: semester, level })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/deliberations?error=${errorCode(error)}`);
  try {
    await computeAndStore(supabase, data.id);
  } catch {
    // The registrar can compute again from the detail page.
  }
  revalidatePath("/admin/deliberations");
  redirect(detail(data.id));
}

export async function computeResults(formData: FormData) {
  const id = str(formData, "id");
  const { supabase } = await actionSession();
  try {
    await computeAndStore(supabase, id);
  } catch (e) {
    redirect(`${detail(id)}?error=${codeFrom(e)}`);
  }
  revalidatePath(detail(id));
  redirect(`${detail(id)}?ok=1`);
}

export async function setStatus(formData: FormData) {
  const id = str(formData, "id");
  const status = str(formData, "status");
  if (!["draft", "locked", "published"].includes(status)) redirect(`${detail(id)}?error=invalid`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("deliberations").update({ status }).eq("id", id);
  if (error) redirect(`${detail(id)}?error=${errorCode(error)}`);
  revalidatePath(detail(id));
  revalidatePath("/admin/deliberations");
  revalidatePath("/results");
  redirect(`${detail(id)}?ok=1`);
}

export async function deleteDeliberation(formData: FormData) {
  const id = str(formData, "id");
  const { supabase } = await actionSession();
  const { error } = await supabase.from("deliberations").delete().eq("id", id);
  if (error) redirect(`${detail(id)}?error=${errorCode(error)}`);
  revalidatePath("/admin/deliberations");
  redirect("/admin/deliberations");
}

export async function addBonus(formData: FormData) {
  const id = str(formData, "id");
  const bonus = Number(str(formData, "bonus").replace(",", "."));
  const reason = str(formData, "reason");
  if (!(bonus > 0) || reason.length < 3) redirect(`${detail(id)}?error=invalid#jury`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("jury_adjustments").insert({
    deliberation_id: id,
    student_id: str(formData, "student_id"),
    teaching_unit_id: str(formData, "teaching_unit_id"),
    bonus,
    reason,
  });
  if (error) redirect(`${detail(id)}?error=${errorCode(error)}#jury`);
  try {
    await computeAndStore(supabase, id);
  } catch (e) {
    redirect(`${detail(id)}?error=${codeFrom(e)}#jury`);
  }
  revalidatePath(detail(id));
  redirect(`${detail(id)}?ok=1#jury`);
}

export async function removeBonus(formData: FormData) {
  const id = str(formData, "id");
  const adjustment = str(formData, "adjustment_id");
  const { supabase } = await actionSession();
  const { error } = await supabase.from("jury_adjustments").delete().eq("id", adjustment);
  if (error) redirect(`${detail(id)}?error=${errorCode(error)}#jury`);
  try {
    await computeAndStore(supabase, id);
  } catch (e) {
    redirect(`${detail(id)}?error=${codeFrom(e)}#jury`);
  }
  revalidatePath(detail(id));
  redirect(`${detail(id)}#jury`);
}

type ResultRow = {
  student_id: string;
  student_name: string;
  ue_results: UEResult[];
  semester_average: number | null;
  credits_earned: number;
  credits_total: number;
  decision: Decision;
  student: { email: string } | { email: string }[] | null;
};

/** Freezes each student's published result into a transcript with its own verification code. */
export async function issueTranscripts(formData: FormData) {
  const id = str(formData, "id");
  const { supabase } = await actionSession();
  const d = await loadDeliberation(supabase, id);
  if (!d) redirect("/admin/deliberations");
  if (d.status !== "published") redirect(`${detail(id)}?error=must_lock_first`);

  const [{ data: inst }, results] = await Promise.all([
    supabase.from("institutions").select("name").eq("id", d.institution_id).single(),
    fetchAll<ResultRow>((from, to) =>
      supabase
        .from("deliberation_results")
        .select("student_id, student_name, ue_results, semester_average, credits_earned, credits_total, decision, student:profiles(email)")
        .eq("deliberation_id", id)
        .range(from, to),
    ),
  ]);
  const programme = one(d.programme);
  const semester = one(d.semester);
  const rows = results.map((r) => {
    const payload: TranscriptPayload = {
      institution: inst?.name ?? "",
      student_name: r.student_name,
      student_email: one(r.student)?.email ?? "",
      programme: programme?.name ?? "",
      programme_code: programme?.code ?? null,
      level: d.level,
      semester: semester?.label ?? "",
      academic_year: one(semester?.academic_year)?.label ?? "",
      ue_results: r.ue_results,
      semester_average: r.semester_average === null ? null : Number(r.semester_average),
      credits_earned: r.credits_earned,
      credits_total: r.credits_total,
      decision: r.decision,
      published_at: d.published_at,
    };
    return { deliberation_id: id, student_id: r.student_id, payload };
  });
  for (const part of chunk(rows, 200)) {
    const { error } = await supabase
      .from("transcripts")
      .upsert(part, { onConflict: "deliberation_id,student_id", ignoreDuplicates: true });
    if (error) redirect(`${detail(id)}?error=${errorCode(error)}`);
  }
  revalidatePath(detail(id));
  redirect(`${detail(id)}?ok=1`);
}
