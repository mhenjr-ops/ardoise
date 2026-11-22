"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

const BACK = "/admin/structure";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** Attaches a course to a UE (its semester follows the UE), with coefficient and optional weights. */
export async function mapCourse(formData: FormData) {
  const courseId = str(formData, "course_id");
  const ueId = str(formData, "teaching_unit_id");
  const coefficient = Number(str(formData, "coefficient").replace(",", ".") || "1");
  const w = ["cc", "tp", "exam"].map((k) => str(formData, `w_${k}`));
  if (!(coefficient > 0) || coefficient > 100) redirect(`${BACK}?error=invalid#mapping`);

  let componentWeights: Record<string, number> | null = null;
  if (w.some(Boolean)) {
    const nums = w.map((v) => Number(v.replace(",", ".") || "0"));
    if (nums.some((n) => !Number.isFinite(n) || n < 0) || nums.every((n) => n === 0)) redirect(`${BACK}?error=invalid#mapping`);
    componentWeights = { cc: nums[0], tp: nums[1], exam: nums[2] };
  }

  const { supabase } = await actionSession();
  let semesterId: string | null = null;
  if (ueId) {
    const { data: ue } = await supabase.from("teaching_units").select("semester_id").eq("id", ueId).maybeSingle();
    semesterId = ue?.semester_id ?? null;
  }
  const { error } = await supabase
    .from("courses")
    .update({ teaching_unit_id: ueId || null, semester_id: semesterId, coefficient, component_weights: componentWeights })
    .eq("id", courseId);
  if (error) redirect(`${BACK}?error=${errorCode(error)}#mapping`);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=1#mapping`);
}
