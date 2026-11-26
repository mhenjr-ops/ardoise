"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";
import { outlineCounts, parseOutline } from "@/lib/structure-outline";

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const CYCLES = ["licence", "master", "doctorat", "hnd", "other"];

/** Every console action names the school by its link name, and comes back to its page. */
function page(fd: FormData) {
  const slug = str(fd, "slug", 60).toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) redirect("/platform");
  return `/platform/${slug}`;
}

function done(back: string, anchor: string, extra = "ok=1"): never {
  revalidatePath(back);
  redirect(`${back}?${extra}#${anchor}`);
}

/** A link for the university's head, administrator or registrar, from the Ardoise team. */
export async function createSchoolInvite(formData: FormData) {
  const back = page(formData);
  const role = String(formData.get("role") ?? "");
  if (!["owner", "admin", "registrar"].includes(role)) redirect(`${back}?error=invalid#invite`);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("platform_invite", {
    p_institution: str(formData, "institution_id", 40),
    p_role: role,
    p_email: str(formData, "email", 320),
    p_full_name: str(formData, "full_name", 200),
  });
  if (error) redirect(`${back}?error=${errorCode(error)}#invite`);
  done(back, "invite");
}

export async function withdrawSchoolInvite(formData: FormData) {
  const back = page(formData);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: str(formData, "id", 40) });
  if (error) redirect(`${back}?error=${errorCode(error)}#invite`);
  done(back, "invite");
}

/** A link for the registrar to check the structure without an account. */
export async function createStructureReview(formData: FormData) {
  const back = page(formData);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("create_structure_review", { p_institution: str(formData, "institution_id", 40) });
  if (error) redirect(`${back}?error=${errorCode(error)}#check`);
  done(back, "check");
}

export async function withdrawStructureReview(formData: FormData) {
  const back = page(formData);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("revoke_structure_review", { p_review: str(formData, "id", 40) });
  if (error) redirect(`${back}?error=${errorCode(error)}#check`);
  done(back, "check");
}

export async function markReviewAnswerDone(formData: FormData) {
  const back = page(formData);
  const { supabase, user } = await actionSession();
  const { error } = await supabase
    .from("structure_review_answers")
    .update({ handled_at: new Date().toISOString(), handled_by: user.id })
    .eq("id", str(formData, "id", 40));
  if (error) redirect(`${back}?error=${errorCode(error)}#check`);
  revalidatePath("/platform", "layout");
  done(back, "check");
}

/** Open a university to students, or take it back to preparation. */
export async function setSchoolStatus(formData: FormData) {
  const back = page(formData);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("set_institution_status", {
    p_institution: str(formData, "institution_id", 40),
    p_status: formData.get("status") === "live" ? "live" : "prospect",
  });
  if (error) redirect(`${back}?error=${errorCode(error)}#status`);
  revalidatePath("/platform");
  done(back, "status");
}

/** The registrar has checked the structure (or it needs checking again). */
export async function setStructureConfirmed(formData: FormData) {
  const back = page(formData);
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("set_structure_confirmed", {
    p_institution: str(formData, "institution_id", 40),
    p_confirmed: formData.get("confirmed") === "1",
  });
  if (error) redirect(`${back}?error=${errorCode(error)}#status`);
  revalidatePath("/platform");
  done(back, "status");
}

export async function importOutline(formData: FormData) {
  const back = page(formData);
  const units = parseOutline(String(formData.get("outline") ?? "").slice(0, 100_000));
  if (!outlineCounts(units).departments && !outlineCounts(units).units) redirect(`${back}?error=empty#import`);
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("import_structure", { p_institution: str(formData, "institution_id", 40), p_units: units });
  if (error) redirect(`${back}?error=${errorCode(error)}#import`);
  const r = data as { units: number; departments: number; programmes: number };
  done(back, "import", `imported=${r.units}-${r.departments}-${r.programmes}`);
}

export async function updateUnit(formData: FormData) {
  const back = page(formData);
  const name = str(formData, "name");
  if (name.length < 2) redirect(`${back}?error=invalid#structure`);
  const { supabase } = await actionSession();
  const { error } = await supabase
    .from("faculties")
    .update({ name, code: str(formData, "code", 20) || null, kind: formData.get("kind") === "school" ? "school" : "faculty" })
    .eq("id", str(formData, "id", 40));
  if (error) redirect(`${back}?error=${errorCode(error)}#structure`);
  done(back, "structure");
}

export async function updateDepartment(formData: FormData) {
  const back = page(formData);
  const name = str(formData, "name");
  if (name.length < 2) redirect(`${back}?error=invalid#structure`);
  const { supabase } = await actionSession();
  const { error } = await supabase
    .from("departments")
    .update({ name, code: str(formData, "code", 20) || null, faculty_id: str(formData, "faculty_id", 40) || null })
    .eq("id", str(formData, "id", 40));
  if (error) redirect(`${back}?error=${errorCode(error)}#structure`);
  done(back, "structure");
}

export async function updateProgramme(formData: FormData) {
  const back = page(formData);
  const name = str(formData, "name");
  const cycle = str(formData, "cycle", 20);
  if (name.length < 2 || !CYCLES.includes(cycle)) redirect(`${back}?error=invalid#structure`);
  const { supabase } = await actionSession();
  const { error } = await supabase
    .from("programmes")
    .update({ name, code: str(formData, "code", 20) || null, cycle, department_id: str(formData, "department_id", 40) || null })
    .eq("id", str(formData, "id", 40));
  if (error) redirect(`${back}?error=${errorCode(error)}#structure`);
  done(back, "structure");
}

/** Removes a unit, department, programme, year, semester or UE; refused while in use. */
export async function removeItem(formData: FormData) {
  const back = page(formData);
  const anchor = str(formData, "anchor", 20) || "structure";
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("remove_structure_item", { p_kind: str(formData, "kind", 20), p_id: str(formData, "id", 40) });
  if (error) redirect(`${back}?error=${errorCode(error)}#${anchor}`);
  done(back, anchor);
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A new academic year; by default with its First and Second Semester, splitting the dates in two. */
export async function addYear(formData: FormData) {
  const back = page(formData);
  const institution_id = str(formData, "institution_id", 40);
  const label = str(formData, "label", 40);
  const starts = str(formData, "starts_on", 10) || null;
  const ends = str(formData, "ends_on", 10) || null;
  const current = formData.get("is_current") === "on";
  if (label.length < 4 || (starts && ends && starts >= ends)) redirect(`${back}?error=invalid#calendar`);
  const { supabase } = await actionSession();
  if (current) await supabase.from("academic_years").update({ is_current: false }).eq("institution_id", institution_id);
  const { data: year, error } = await supabase
    .from("academic_years")
    .insert({ institution_id, label, starts_on: starts, ends_on: ends, is_current: current })
    .select("id")
    .single();
  if (error || !year) redirect(`${back}?error=${errorCode(error)}#calendar`);

  if (formData.get("with_semesters") === "on") {
    const fr = str(formData, "locale", 5) === "fr";
    const names = fr ? ["Premier semestre", "Second semestre"] : ["First Semester", "Second Semester"];
    let split: [string | null, string | null, string | null, string | null] = [starts, null, null, ends];
    if (starts && ends) {
      const a = new Date(`${starts}T00:00:00Z`).getTime();
      const b = new Date(`${ends}T00:00:00Z`).getTime();
      const mid = new Date(a + Math.floor((b - a) / DAY / 2) * DAY);
      split = [starts, iso(mid), iso(new Date(mid.getTime() + DAY)), ends];
    }
    const { error: semError } = await supabase.from("semesters").insert([
      { institution_id, academic_year_id: year.id, label: names[0], starts_on: split[0], ends_on: split[1] },
      { institution_id, academic_year_id: year.id, label: names[1], starts_on: split[2], ends_on: split[3] },
    ]);
    if (semError) redirect(`${back}?error=${errorCode(semError)}#calendar`);
  }
  done(back, "calendar");
}

export async function makeCurrent(formData: FormData) {
  const back = page(formData);
  const { supabase } = await actionSession();
  await supabase.from("academic_years").update({ is_current: false }).eq("institution_id", str(formData, "institution_id", 40));
  const { error } = await supabase.from("academic_years").update({ is_current: true }).eq("id", str(formData, "id", 40));
  if (error) redirect(`${back}?error=${errorCode(error)}#calendar`);
  done(back, "calendar");
}

export async function addSemester(formData: FormData) {
  const back = page(formData);
  const label = str(formData, "label", 60);
  if (label.length < 2) redirect(`${back}?error=invalid#calendar`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("semesters").insert({
    institution_id: str(formData, "institution_id", 40),
    academic_year_id: str(formData, "academic_year_id", 40),
    label,
    starts_on: str(formData, "starts_on", 10) || null,
    ends_on: str(formData, "ends_on", 10) || null,
  });
  if (error) redirect(`${back}?error=${errorCode(error)}#calendar`);
  done(back, "calendar");
}

export async function addUe(formData: FormData) {
  const back = page(formData);
  const credits = Number(str(formData, "credits", 3));
  const code = str(formData, "code", 20).toUpperCase();
  const title = str(formData, "title");
  if (!Number.isInteger(credits) || credits < 0 || credits > 60 || !code || !title) redirect(`${back}?error=invalid#ues`);
  const { supabase } = await actionSession();
  const { error } = await supabase.from("teaching_units").insert({
    institution_id: str(formData, "institution_id", 40),
    code,
    title,
    credits,
    level: str(formData, "level", 10) || null,
    programme_id: str(formData, "programme_id", 40) || null,
    semester_id: str(formData, "semester_id", 40) || null,
  });
  if (error) redirect(`${back}?error=${errorCode(error)}#ues`);
  done(back, "ues");
}

export async function markSupportDone(formData: FormData) {
  const from = str(formData, "back", 100);
  const back = from === "/platform/requests" ? from : page(formData);
  const { supabase, user } = await actionSession();
  await supabase
    .from("support_requests")
    .update({ handled_at: new Date().toISOString(), handled_by: user.id })
    .eq("id", str(formData, "id", 40));
  revalidatePath("/platform/requests");
  revalidatePath("/platform", "layout");
  done(back, "requests");
}
