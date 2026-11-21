import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { loadDeliberation, loadUEs, one } from "@/lib/deliberation";
import { buildPvPdf, type PvInput } from "@/lib/pdf";

export async function GET(_request: Request, { params }: RouteContext<"/admin/deliberations/[id]/pv">) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // RLS shows deliberations only to the school's admins and registrar.
  const d = await loadDeliberation(supabase, id);
  if (!d) return new NextResponse("Not found", { status: 404 });
  const { data: allowed } = await supabase.rpc("has_inst_role", { inst: d.institution_id, roles: ["admin", "registrar"] });
  if (allowed !== true) return new NextResponse("Forbidden", { status: 403 });

  const { t, locale } = await getI18n();
  const [{ data: inst }, ues, results, { data: adj }] = await Promise.all([
    supabase.from("institutions").select("name").eq("id", d.institution_id).single(),
    loadUEs(supabase, d),
    fetchAll<PvInput["results"][number]>((from, to) =>
      supabase
        .from("deliberation_results")
        .select("student_name, ue_results, semester_average, credits_earned, credits_total, decision")
        .eq("deliberation_id", id)
        .order("student_name")
        .range(from, to),
    ),
    supabase
      .from("jury_adjustments")
      .select("bonus, reason, student:profiles!jury_adjustments_student_id_fkey(full_name), ue:teaching_units(code)")
      .eq("deliberation_id", id)
      .order("created_at"),
  ]);

  const semester = one(d.semester);
  const pdf = await buildPvPdf({
    t,
    locale,
    institution: inst?.name ?? "",
    programme: one(d.programme)?.name ?? "",
    level: d.level,
    semester: semester?.label ?? "",
    year: one(semester?.academic_year)?.label ?? "",
    status: d.status,
    policy: d.policy,
    ues: ues.map((u) => ({ id: u.id, code: u.code, credits: Number(u.credits) })),
    results: results.map((r) => ({ ...r, semester_average: r.semester_average === null ? null : Number(r.semester_average) })),
    adjustments: ((adj ?? []) as unknown as Array<{
      bonus: number;
      reason: string;
      student: { full_name: string } | { full_name: string }[] | null;
      ue: { code: string } | { code: string }[] | null;
    }>).map((a) => ({ student: one(a.student)?.full_name ?? "", ue: one(a.ue)?.code ?? "", bonus: Number(a.bonus), reason: a.reason })),
    date: formatDate(locale, d.published_at ?? d.locked_at ?? new Date().toISOString()),
  });

  const name = `PV-${(one(d.programme)?.code ?? "programme").replace(/[^A-Za-z0-9_-]/g, "")}-${d.level}-${(semester?.label ?? "").replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
