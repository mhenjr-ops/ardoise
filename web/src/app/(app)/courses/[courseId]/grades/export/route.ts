import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { weightedAverage } from "@/lib/grades";
import type { Assignment, Grade } from "@/lib/types";

type StudentRow = { user_id: string; profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null };

/**
 * Gradebook as CSV. French Excel expects ";" separators and decimal commas,
 * so the format follows the interface language.
 */
export async function GET(_request: Request, { params }: RouteContext<"/courses/[courseId]/grades/export">) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: isStaff } = await supabase.rpc("is_course_staff", { course: courseId });
  if (isStaff !== true) return new NextResponse("Forbidden", { status: 403 });

  const [{ data: course }, { data: aData }, { data: gData }, { data: sData }] = await Promise.all([
    supabase.from("courses").select("code").eq("id", courseId).single(),
    supabase
      .from("assignments")
      .select("id, title, points_possible, weight, component")
      .eq("course_id", courseId)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("grades").select("assignment_id, student_id, score").eq("course_id", courseId),
    supabase.from("enrollments").select("user_id, profile:profiles(full_name, email)").eq("course_id", courseId).eq("role", "student"),
  ]);

  const locale = await getLocale();
  const sep = locale === "fr" ? ";" : ",";
  const num = (v: number | null) =>
    v === null || v === undefined ? "" : locale === "fr" ? String(v).replace(".", ",") : String(v);
  const cell = (v: string) => (/[";,\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  const assignments = (aData ?? []) as Pick<Assignment, "id" | "title" | "points_possible" | "weight" | "component">[];
  const grades = (gData ?? []) as Pick<Grade, "assignment_id" | "student_id" | "score">[];
  const students = ((sData ?? []) as StudentRow[])
    .map((row) => {
      const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { id: row.user_id, name: p?.full_name ?? "", email: p?.email ?? "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const header = [
    locale === "fr" ? "Nom" : "Name",
    "Email",
    ...assignments.map((a) => `${a.title} (/${num(Number(a.points_possible))}, x${num(Number(a.weight))})`),
    locale === "fr" ? "Moyenne /20" : "Average /20",
  ];
  const lines = [header.map(cell).join(sep)];
  for (const s of students) {
    const row = [
      s.name,
      s.email,
      ...assignments.map((a) => {
        const g = grades.find((x) => x.assignment_id === a.id && x.student_id === s.id);
        return num(g?.score ?? null);
      }),
      num(weightedAverage(assignments, grades, s.id)),
    ];
    lines.push(row.map(cell).join(sep));
  }

  const filename = `notes-${(course?.code ?? "cours").replace(/[^A-Za-z0-9_-]/g, "")}.csv`;
  // Leading BOM so Excel opens accented names correctly.
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
