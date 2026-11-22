import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BookOpen, ClipboardList, FileSpreadsheet, MessageSquareText, Users } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Card, Flash, Stat } from "@/components/ui";
import { fmt } from "@/lib/i18n/messages-engage";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.title };
}

/**
 * The university at a glance, built from counts only so it stays fast with thousands of
 * students and hundreds of courses; each list lives in its own tab, with search.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const [{ supabase, institution, can }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error, ok } = await searchParams;

  // Deans and heads of department work from their dashboard and the Staff tab.
  if (!can.manageStudents) redirect(can.adminArea ? "/admin/people" : "/dashboard");

  const inst = institution.id;
  const head = { count: "exact" as const, head: true };
  const [
    { count: rosterTotal },
    { count: rosterLinked },
    { count: claimCount },
    { count: courseCount },
    { count: staffCount },
    { count: attendanceAll },
    { count: attendancePresent },
    { count: decidedAll },
    { count: decidedPassed },
    { count: openRequests },
  ] = await Promise.all([
    supabase.from("student_roster").select("id", head).eq("institution_id", inst),
    supabase.from("student_roster").select("id", head).eq("institution_id", inst).not("claimed_by", "is", null),
    supabase.from("matricule_claims").select("id", head).eq("institution_id", inst).in("status", ["waiting", "disputed"]),
    supabase.from("courses").select("id", head).eq("institution_id", inst),
    supabase.from("memberships").select("id", head).eq("institution_id", inst).neq("role", "student"),
    supabase.from("attendance_records").select("id", head).eq("institution_id", inst),
    supabase.from("attendance_records").select("id", head).eq("institution_id", inst).neq("status", "absent"),
    supabase.from("deliberation_results").select("id", head).eq("institution_id", inst),
    supabase.from("deliberation_results").select("id", head).eq("institution_id", inst).in("decision", ["admitted", "admitted_compensation"]),
    supabase.from("support_requests").select("id", head).eq("institution_id", inst).is("handled_at", null),
  ]);
  const attRate = attendanceAll ? (attendancePresent ?? 0) / attendanceAll : null;
  const passRate = decidedAll ? (decidedPassed ?? 0) / decidedAll : null;

  const tile = (href: string, icon: ReactNode, title: string, body: string, accent = false) => (
    <Link href={href as "/admin"} className="block">
      <Card lifted className="flex h-full items-center gap-4 p-5 transition-colors hover:border-ardoise">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${accent ? "bg-ochre-500 text-[#12100C]" : "bg-ardoise text-chalk"}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold">{title}</p>
          <p className="text-[14px] text-slate-600">{body}</p>
        </div>
      </Card>
    </Link>
  );

  return (
    <>
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />

      <section className="mb-8">
        <h2 className="mb-4 font-display text-2xl font-semibold">{t.analytics.institutionTitle}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t.dash.statStudents} value={rosterLinked ?? 0} hint={fmt(t.master.onList, { n: rosterTotal ?? 0 })} />
          <Stat label={t.dash.statCourses} value={courseCount ?? 0} hint={`${staffCount ?? 0} ${t.home.staff.toLowerCase()}`} />
          <Stat
            label={t.analytics.attendance}
            value={attRate === null ? "—" : `${Math.round(attRate * 100)} %`}
            tone={attRate !== null && attRate < 0.75 ? "terracotta" : "leaf"}
          />
          <Stat
            label={t.analytics.passRate}
            value={passRate === null ? "—" : `${Math.round(passRate * 100)} %`}
            tone={passRate !== null && passRate < 0.5 ? "terracotta" : "ochre"}
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {tile("/admin/upload", <FileSpreadsheet size={20} aria-hidden />, t.roster.importTitle, t.roster.uploadHint, true)}
        {tile(
          "/admin/students",
          <ClipboardList size={20} aria-hidden />,
          t.roster.title,
          `${fmt(t.roster.signedUp, { n: rosterLinked ?? 0, total: rosterTotal ?? 0 })}${claimCount ? ` · ${fmt(t.home.claimsWaiting, { n: claimCount })}` : ""}`,
        )}
        {tile("/admin/courses", <BookOpen size={20} aria-hidden />, t.nav2.courses, fmt(t.adminCourses.count, { n: courseCount ?? 0 }))}
        {tile("/admin/people", <Users size={20} aria-hidden />, t.staffing.title, `${staffCount ?? 0} ${t.home.staff.toLowerCase()} · ${t.staffing.invite}`)}
        {tile(
          "/admin/requests",
          <MessageSquareText size={20} aria-hidden />,
          t.schoolRequests.title,
          openRequests ? `${openRequests} ${t.structure.statusOpen.toLowerCase()}` : t.schoolRequests.structureLink,
        )}
      </div>
    </>
  );
}
