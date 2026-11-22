"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionSession } from "@/lib/session";
import type { RosterRow } from "@/lib/roster";

export type ImportResult = {
  created: number;
  updated: number;
  course_links: number;
  enrolled: number;
  claims_linked: number;
  unknown_courses: string[];
};

/** Sends the parsed list in batches; returns the totals (or an error code). */
export async function importRoster(institutionId: string, rows: RosterRow[]): Promise<ImportResult | { error: string }> {
  const { supabase } = await actionSession();
  const total: ImportResult = { created: 0, updated: 0, course_links: 0, enrolled: 0, claims_linked: 0, unknown_courses: [] };
  const clean = rows.slice(0, 50000).map((r) => ({
    matricule: String(r.matricule ?? "").slice(0, 40),
    full_name: String(r.full_name ?? "").slice(0, 200),
    email: String(r.email ?? "").slice(0, 320),
    phone: String(r.phone ?? "").slice(0, 40),
    programme: String(r.programme ?? "").slice(0, 200),
    level: String(r.level ?? "").slice(0, 40),
    courses: (Array.isArray(r.courses) ? r.courses : []).slice(0, 60).map((c) => String(c).slice(0, 40)),
  }));
  for (let i = 0; i < clean.length; i += 2000) {
    const { data, error } = await supabase.rpc("import_roster", { p_institution: institutionId, p_rows: clean.slice(i, i + 2000) });
    if (error) return { error: error.message.includes("forbidden") ? "forbidden" : "generic" };
    const r = data as ImportResult;
    total.created += r.created;
    total.updated += r.updated;
    total.course_links += r.course_links;
    total.enrolled += r.enrolled;
    total.claims_linked += r.claims_linked;
    for (const c of r.unknown_courses ?? []) if (!total.unknown_courses.includes(c)) total.unknown_courses.push(c);
  }
  revalidatePath("/admin/students");
  return total;
}

export async function resolveClaim(formData: FormData) {
  const { supabase } = await actionSession();
  const { error } = await supabase.rpc("resolve_claim", {
    p_claim: String(formData.get("id") ?? "").slice(0, 40),
    p_approve: formData.get("approve") === "1",
  });
  if (error) {
    const code = ["forbidden", "matricule_not_listed"].find((k) => error.message.includes(k)) ?? "generic";
    redirect(`/admin/students?error=${code}`);
  }
  revalidatePath("/admin/students");
  redirect("/admin/students?ok=1");
}
