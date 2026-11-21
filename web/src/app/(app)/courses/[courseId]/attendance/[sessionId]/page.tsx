import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, QrCode, Trash2 } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDateTime, nowMs } from "@/lib/format";
import { formatTime } from "@/lib/calendar";
import { Avatar, Badge, Button, Card, Flash, Select, cx } from "@/components/ui";
import type { AttendanceRecord, AttendanceStatus } from "@/lib/types";
import { closeCode, deleteSession, openCode, saveRoll } from "../actions";
import { LiveRefresh, MarkAllPresent } from "../live-refresh";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];
const active: Record<AttendanceStatus, string> = {
  present: "peer-checked:bg-leaf-500 peer-checked:text-white peer-checked:border-leaf-500",
  late: "peer-checked:bg-ochre-500 peer-checked:text-slate-950 peer-checked:border-ochre-500",
  absent: "peer-checked:bg-terracotta-500 peer-checked:text-white peer-checked:border-terracotta-500",
  excused: "peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600",
};

export default async function SessionPage({ params, searchParams }: PageProps<"/courses/[courseId]/attendance/[sessionId]">) {
  const { courseId, sessionId } = await params;
  const sp = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  if (!isStaff) redirect(`/courses/${courseId}/attendance`);

  const { data: session } = await supabase.from("attendance_sessions").select("id, starts_at, topic").eq("id", sessionId).eq("course_id", course.id).maybeSingle();
  if (!session) notFound();
  const [{ data: studentRows }, { data: recordRows }, { data: codeRow }] = await Promise.all([
    supabase.from("enrollments").select("user_id, profile:profiles(full_name, email)").eq("course_id", course.id).eq("role", "student"),
    supabase.from("attendance_records").select("id, session_id, student_id, status, method, marked_at").eq("session_id", session.id),
    supabase.from("attendance_codes").select("code, expires_at").eq("session_id", session.id).maybeSingle(),
  ]);
  const students = (studentRows ?? [])
    .map((r) => {
      const p = (Array.isArray(r.profile) ? r.profile[0] : r.profile) as { full_name: string; email: string } | null;
      return { id: r.user_id as string, name: p?.full_name || p?.email || "?" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const records = (recordRows ?? []) as AttendanceRecord[];
  const codeOpen = codeRow && new Date(codeRow.expires_at).getTime() > nowMs() ? codeRow : null;
  const checkedIn = records.filter((r) => r.method === "code").length;
  const base = { course_id: course.id, session_id: session.id };

  return (
    <div className="space-y-5">
      {codeOpen ? <LiveRefresh /> : null}
      <Link href={`/courses/${course.id}/attendance`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={15} aria-hidden />
        {t.attendance.title}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[1.8rem] font-semibold leading-tight">{session.topic || t.attendance.title}</h2>
          <p className="text-[14.5px] text-slate-500">{formatDateTime(locale, session.starts_at)}</p>
        </div>
        <form action={deleteSession}>
          <input type="hidden" name="course_id" value={base.course_id} />
          <input type="hidden" name="session_id" value={base.session_id} />
          <Button type="submit" variant="danger" size="sm">
            <Trash2 size={14} aria-hidden />
            {t.attendance.deleteSession}
          </Button>
        </form>
      </div>
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} ok={sp.ok ? t.attendance.saved : null} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <form action={saveRoll}>
            <input type="hidden" name="course_id" value={base.course_id} />
            <input type="hidden" name="session_id" value={base.session_id} />
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <h3 className="text-[15px] font-bold">{t.analytics.students}</h3>
              <MarkAllPresent label={t.attendance.markAllPresent} />
            </div>
            <ul className="divide-y divide-slate-100">
              {students.map((st) => {
                const r = records.find((x) => x.student_id === st.id);
                return (
                  <li key={st.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                    <Avatar name={st.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{st.name}</span>
                      {r?.method === "code" ? <span className="text-[12px] font-semibold text-leaf-700">{t.attendance.method.code}</span> : null}
                    </span>
                    <fieldset className="flex gap-1">
                      <legend className="sr-only">{st.name}</legend>
                      {STATUSES.map((s) => (
                        <label key={s} className="cursor-pointer">
                          <input type="radio" name={`s_${st.id}`} value={s} defaultChecked={r?.status === s} className="peer sr-only" />
                          <span
                            className={cx(
                              "block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-slate-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ochre-400",
                              active[s],
                            )}
                          >
                            {t.attendance.statuses[s]}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-200 px-5 py-3">
              <Button type="submit">{t.attendance.save}</Button>
            </div>
          </form>
        </Card>

        <Card className="self-start overflow-hidden">
          {codeOpen ? (
            <div className="bg-ardoise px-5 py-6 text-center text-chalk">
              <p className="text-[13.5px] font-semibold text-chalk/70">{t.attendance.codeHelp}</p>
              <p className="num my-4 font-display text-[3.4rem] font-semibold leading-none tracking-[0.14em] text-ochre-300">
                {codeOpen.code.slice(0, 3)} {codeOpen.code.slice(3)}
              </p>
              <p className="text-[13.5px] text-chalk/70">{fmt(t.attendance.expires, { time: formatTime(locale, codeOpen.expires_at) })}</p>
              <Badge tone="success">
                {checkedIn}/{students.length}
              </Badge>
              <form action={closeCode} className="mt-5">
                <input type="hidden" name="course_id" value={base.course_id} />
                <input type="hidden" name="session_id" value={base.session_id} />
                <Button type="submit" variant="accent" className="w-full">
                  {t.attendance.closeCode}
                </Button>
              </form>
            </div>
          ) : (
            <form action={openCode} className="space-y-3 p-5">
              <input type="hidden" name="course_id" value={base.course_id} />
              <input type="hidden" name="session_id" value={base.session_id} />
              <QrCode size={28} className="text-ochre-600" aria-hidden />
              <p className="text-[15px] font-bold">{t.attendance.openCode}</p>
              <p className="text-[14px] text-slate-500">{t.attendance.codeHelp}</p>
              <Select name="minutes" defaultValue="10" aria-label="min">
                {[5, 10, 15, 30].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
              <Button type="submit" className="w-full">
                {t.attendance.openCode}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
