"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";

const BACK = "/admin/structure";

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** One action for every structure form; `kind` says which table. */
export async function createRecord(formData: FormData) {
  const kind = str(formData, "kind");
  const institution_id = str(formData, "institution_id");
  const { supabase } = await actionSession();
  let table = "";
  let row: Record<string, unknown> = {};

  switch (kind) {
    case "faculty":
      table = "faculties";
      row = { name: str(formData, "name"), code: str(formData, "code") || null };
      break;
    case "department":
      table = "departments";
      row = { name: str(formData, "name"), code: str(formData, "code") || null, faculty_id: str(formData, "faculty_id") || null };
      break;
    case "programme":
      table = "programmes";
      row = {
        name: str(formData, "name"),
        code: str(formData, "code") || null,
        department_id: str(formData, "department_id") || null,
        cycle: str(formData, "cycle") || "licence",
      };
      break;
    case "year":
      table = "academic_years";
      row = {
        label: str(formData, "label"),
        starts_on: str(formData, "starts_on") || null,
        ends_on: str(formData, "ends_on") || null,
        is_current: formData.get("is_current") === "on",
      };
      break;
    case "semester":
      table = "semesters";
      row = { label: str(formData, "label"), academic_year_id: str(formData, "academic_year_id") };
      break;
    case "ue": {
      table = "teaching_units";
      const credits = Number(str(formData, "credits"));
      if (!Number.isInteger(credits) || credits < 0 || credits > 60) redirect(`${BACK}?error=invalid#ues`);
      row = {
        code: str(formData, "code").toUpperCase(),
        title: str(formData, "title"),
        credits,
        level: str(formData, "level") || null,
        programme_id: str(formData, "programme_id") || null,
        semester_id: str(formData, "semester_id") || null,
      };
      break;
    }
    default:
      redirect(`${BACK}?error=invalid`);
  }

  const required = Object.entries(row).filter(([k]) => ["name", "label", "title", "code", "academic_year_id"].includes(k));
  if (required.some(([k, v]) => (k === "code" ? kind === "ue" && !v : !v))) redirect(`${BACK}?error=invalid`);

  if (kind === "year" && row.is_current) {
    await supabase.from("academic_years").update({ is_current: false }).eq("institution_id", institution_id);
  }
  const { error } = await supabase.from(table).insert({ ...row, institution_id });
  if (error) redirect(`${BACK}?error=${errorCode(error)}`);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=1#${kind}`);
}

export async function deleteUE(formData: FormData) {
  const id = str(formData, "id");
  const { supabase } = await actionSession();
  const { count } = await supabase.from("courses").select("id", { count: "exact", head: true }).eq("teaching_unit_id", id);
  if ((count ?? 0) > 0) redirect(`${BACK}?error=invalid#ues`);
  const { error } = await supabase.from("teaching_units").delete().eq("id", id);
  if (error) redirect(`${BACK}?error=${errorCode(error)}`);
  revalidatePath(BACK);
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
