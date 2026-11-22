import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime, isoToCameroonLocal, nowIso } from "@/lib/format";
import { Avatar, Badge, Button, Card, CardHeader, Disclosure, Empty, Field, Flash, Input, ProgressRing, Stat, cx } from "@/components/ui";
import type { AttendanceRecord, AttendanceSession, AttendanceStatus } from "@/lib/types";
import { createSession } from "./actions";
import { CheckInCard } from "./checkin-card";

const tone: Record<AttendanceStatus, string> = {
  present: "bg-leaf-500",
  late: "bg-ochre-500",
  absent: "bg-terracotta-500",
  excused: "bg-indigo-500",
};
const badgeTone = { present: "success", late: "warn", absent: "danger", excused: "info" } as const;

export default async function AttendancePage({ params, searchParams }: PageProps<"/courses/[courseId]/attendance">) {
  const { courseId } = await params;
  const sp = await searchParams;
  const [{ supabase, course, isStaff, canSeeStaffViews, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const back = `/courses/${course.id}/attendance`;

  const [{ data: sessionRows }, { data: recordRows }] = await Promise.all([
    supabase.from("attendance_sessions").select("id, course_id, starts_at, topic").eq("course_id", course.id).order("starts_at", { ascending: false }),
    supabase.from("attendance_records").select("id, session_id, student_id, status, method, marked_at").eq("course_id", course.id),
  ]);
  const sessions = (sessionRows ?? []) as AttendanceSession[];
  const records = (recordRows ?? []) as AttendanceRecord[];
  const attended = (rs: AttendanceRecord[]) => (rs.length ? rs.filter((r) => r.status !== "absent").length / rs.length : null);

  if (!canSeeStaffViews) {
    const mine = records.filter((r) => r.student_id === user.id);
    const rate = attended(mine);
    return (
      <div className="space-y-5">
        <CheckInCard t={t} back={back} result={typeof sp.checkin === "string" ? sp.checkin : undefined} course={typeof sp.course === "string" ? sp.course : undefined} />
        <Card>
          <CardHeader
            title={t.attendance.mine}
            action={rate !== null ? <ProgressRing value={rate} size={40} label={`${Math.round(rate * 100)}`} tone={rate < 0.75 ? "terracotta" : "leaf"} /> : null}
          />
          {sessions.length === 0 ? (
            <p className="px-5 py-5 text-[15px] text-slate-500">{t.attendance.noSessions}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const r = mine.find((x) => x.session_id === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="num w-44 shrink-0 text-[13.5px] font-semibold text-slate-500">{formatDateTime(locale, s.starts_at)}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px]">{s.topic || "—"}</span>
                    {r ? <Badge tone={badgeTone[r.status]}>{t.attendance.statuses[r.status]}</Badge> : <Badge>{t.attendance.unmarked}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  const { data: studentRows } = await supabase
    .from("enrollments")
    .select("user_id, profile:profiles(full_name, email)")
    .eq("course_id", course.id)
    .eq("role", "student");
  const students = (studentRows ?? [])
    .map((r) => {
      const p = (Array.isArray(r.profile) ? r.profile[0] : r.profile) as { full_name: string; email: string } | null;
      return { id: r.user_id as string, name: p?.full_name || p?.email || "?" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const overall = attended(records);
  const recent = sessions.slice(0, 10).reverse();

  return (
    <div className="space-y-5">
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={t.attendance.sessions} value={sessions.length} />
        <Stat label={t.attendance.rate} value={overall === null ? "—" : `${Math.round(overall * 100)} %`} tone={overall !== null && overall < 0.75 ? "terracotta" : "leaf"} />
        <Stat label={t.analytics.students} value={students.length} />
      </div>

      {isStaff ? (
      <Disclosure summary={t.attendance.newSession} open={sessions.length === 0}>
        <form action={createSession} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <input type="hidden" name="course_id" value={course.id} />
          <Field label={t.attendance.topic}>
            <Input name="topic" maxLength={200} placeholder="Cours 4 : les fonctions" />
          </Field>
          <Field label={t.calendar.starts}>
            <Input name="starts_at" type="datetime-local" defaultValue={isoToCameroonLocal(nowIso())} />
          </Field>
          <Button type="submit">{t.common.create}</Button>
        </form>
      </Disclosure>
      ) : null}

      {sessions.length === 0 ? (
        <Empty>{t.attendance.noSessions}</Empty>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader title={t.attendance.rate} icon={<CalendarCheck2 size={17} aria-hidden />} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[12.5px] text-slate-500">
                    <th className="px-5 py-2.5 font-bold">{t.grades.student}</th>
                    {recent.map((s) => (
                      <th key={s.id} className="px-1 py-2.5 text-center font-bold">
                        <Link href={`${back}/${s.id}`} className="num hover:text-ardoise" title={s.topic}>
                          {new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "2-digit", timeZone: "Africa/Douala" }).format(new Date(s.starts_at))}
                        </Link>
                      </th>
                    ))}
                    <th className="px-5 py-2.5 text-right font-bold">{t.attendance.rate}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => {
                    const mine = records.filter((r) => r.student_id === st.id);
                    const rate = attended(mine);
                    return (
                      <tr key={st.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={st.name} size={28} />
                            <span className="font-semibold">{st.name}</span>
                          </span>
                        </td>
                        {recent.map((s) => {
                          const r = mine.find((x) => x.session_id === s.id);
                          return (
                            <td key={s.id} className="px-1 py-2.5 text-center">
                              <span
                                title={r ? t.attendance.statuses[r.status] : t.attendance.unmarked}
                                className={cx("inline-block h-3 w-3 rotate-45 rounded-[3px]", r ? tone[r.status] : "bg-slate-200")}
                              />
                            </td>
                          );
                        })}
                        <td className={cx("num px-5 py-2.5 text-right font-bold", rate !== null && rate < 0.75 ? "text-terracotta-600" : "text-slate-700")}>
                          {rate === null ? "—" : `${Math.round(rate * 100)} %`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-3 text-[12.5px] text-slate-500">
              {(Object.keys(tone) as AttendanceStatus[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={cx("h-2.5 w-2.5 rotate-45 rounded-[2px]", tone[k])} />
                  {t.attendance.statuses[k]}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.attendance.sessions} />
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const rs = records.filter((r) => r.session_id === s.id);
                const present = rs.filter((r) => r.status !== "absent").length;
                return (
                  <li key={s.id}>
                    <Link href={`${back}/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      <span className="num w-44 shrink-0 text-[13.5px] font-semibold text-slate-500">{formatDateTime(locale, s.starts_at)}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{s.topic || "—"}</span>
                      <span className="num text-[13.5px] font-bold text-slate-600">
                        {present}/{students.length}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
