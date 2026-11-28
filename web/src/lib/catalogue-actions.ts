"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import { errorCode } from "@/lib/errors";
import type { CatalogueRow } from "@/lib/catalogue";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEEP = ["q", "dept", "year", "sem", "mine", "page"] as const;
const field = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

/** The page the form came from (and its filters): a catalogue page, nothing else. */
function back(fd: FormData, extra: Record<string, string>, hash = ""): string {
  const b = field(fd, "back", 90);
  const path = b === "/admin/catalogue" || b === "/courses/add" || /^\/platform\/[a-z0-9-]{2,60}\/catalogue$/.test(b) ? b : "/dashboard";
  const from = new URLSearchParams(field(fd, "qs", 400));
  const qs = new URLSearchParams();
  for (const k of KEEP) {
    const v = from.get(k);
    if (v) qs.set(k, v.slice(0, 80));
  }
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  return `${path}?${qs}${hash}`;
}

const uuid = (fd: FormData, k: string) => {
  const v = field(fd, k, 40);
  return UUID.test(v) ? v : null;
};
const intIn = (fd: FormData, k: string, lo: number, hi: number) => {
  const n = Number(field(fd, k, 4));
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

function refresh() {
  revalidatePath("/courses/add");
  revalidatePath("/admin/catalogue");
  revalidatePath("/dashboard");
}

/** Adds a course to the catalogue, or edits one; with "teach", the lecturer also starts teaching it. */
export async function saveCatalogueCourse(formData: FormData) {
  const inst = uuid(formData, "institution_id");
  const id = uuid(formData, "id");
  const code = field(formData, "code", 40).replace(/\s+/g, "").toUpperCase();
  const title = field(formData, "title", 300);
  if (!inst || !code || !title) redirect(back(formData, { error: "invalid" }));
  const creditsRaw = field(formData, "credits", 5).replace(",", ".");
  const credits = /^\d{1,2}(\.\d)?$/.test(creditsRaw) ? Number(creditsRaw) : null;
  const departments = formData
    .getAll("departments")
    .map((d) => String(d))
    .filter((d) => UUID.test(d))
    .slice(0, 40);
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("catalogue_save", {
    p_institution: inst,
    p_id: id,
    p_code: code,
    p_title: title,
    p_level: intIn(formData, "level", 1, 8),
    p_semester: intIn(formData, "semester", 1, 2),
    p_credits: credits,
    p_departments: departments,
  });
  if (error) redirect(back(formData, { error: errorCode(error) }, id ? "" : "#add"));
  if (formData.get("teach") === "1" && typeof data === "string") {
    const { error: teachError } = await supabase.rpc("teach_catalogue_course", { p_catalogue: data });
    if (teachError) redirect(back(formData, { error: errorCode(teachError) }));
    refresh();
    redirect(back(formData, { ok: "addedTeach", q: code }));
  }
  refresh();
  redirect(back(formData, { ok: id ? "saved" : "added", ...(id ? {} : { q: code }) }));
}

export async function retireCatalogueCourse(formData: FormData) {
  const id = uuid(formData, "id");
  if (!id) redirect(back(formData, { error: "invalid" }));
  const retire = formData.get("retire") === "1";
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("catalogue_retire", { p_id: id, p_retired: retire });
  if (error) redirect(back(formData, { error: errorCode(error) }));
  refresh();
  redirect(back(formData, { ok: retire ? "retiredOk" : "restoredOk" }));
}

/** "I teach this": opens the course for the semester if nobody has, and joins it. */
export async function teachCatalogueCourse(formData: FormData) {
  const id = uuid(formData, "id");
  if (!id) redirect(back(formData, { error: "invalid" }));
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("teach_catalogue_course", { p_catalogue: id });
  if (error) redirect(back(formData, { error: errorCode(error) }));
  refresh();
  redirect(back(formData, { ok: "addedTeach" }));
}

export async function leaveTaughtCourse(formData: FormData) {
  const id = uuid(formData, "course_id");
  if (!id) redirect(back(formData, { error: "invalid" }));
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("leave_course", { p_course: id });
  if (error) redirect(back(formData, { error: errorCode(error) }));
  refresh();
  redirect(back(formData, { ok: "left" }));
}

export type CatalogueImportResult = {
  created: number;
  updated: number;
  linked: number;
  new_departments: number;
  skipped: number;
  unknown_departments: string[];
};

/** One batch of an import (the browser sends the file in batches). */
export async function importCatalogue(institutionId: string, rows: CatalogueRow[]): Promise<CatalogueImportResult | { error: string }> {
  if (!UUID.test(String(institutionId)) || !Array.isArray(rows) || rows.length > 2000) return { error: "invalid" };
  const clean = rows.map((r) => ({
    code: String(r.code ?? "").slice(0, 40),
    title: String(r.title ?? "").slice(0, 300),
    level: String(r.level ?? "").slice(0, 40),
    semester: String(r.semester ?? "").slice(0, 4),
    credits: String(r.credits ?? "").slice(0, 5),
    school: String(r.school ?? "").slice(0, 200),
    department: String(r.department ?? "").slice(0, 200),
  }));
  const { supabase } = await actionSession();
  const { data, error } = await supabase.rpc("catalogue_import", { p_institution: institutionId, p_rows: clean });
  if (error) return { error: errorCode(error) };
  revalidatePath("/admin/catalogue");
  revalidatePath("/courses/add");
  return data as CatalogueImportResult;
}
