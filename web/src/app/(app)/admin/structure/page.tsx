import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarRange, MessageSquareText } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { loadStructure } from "@/lib/structure";
import { StructureTree } from "@/components/structure/structure-tree";
import { Badge, Button, Card, CardHeader, Flash, Input, Select } from "@/components/ui";
import { mapCourse } from "./actions";

type CourseRow = {
  id: string;
  code: string;
  title: string;
  teaching_unit_id: string | null;
  coefficient: number;
  component_weights: Record<string, number> | null;
};

function Section({ id, title, icon, children }: { id: string; title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader title={title} icon={icon} />
      <div className="space-y-4 px-5 py-4">{children}</div>
    </Card>
  );
}

/**
 * The school's structure as the Ardoise team set it up, read-only, with a way to ask for
 * changes. Courses are attached to teaching units here (coefficients and weights).
 */
export default async function StructurePage({ searchParams }: PageProps<"/admin/structure">) {
  const [{ supabase, institution, can }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error, ok, mq } = await searchParams;
  const mapQuery = typeof mq === "string" ? mq.trim().slice(0, 40) : "";
  const inst = institution.id;

  const [structure, reqs] = await Promise.all([
    loadStructure(supabase, inst),
    supabase.from("support_requests").select("id", { count: "exact", head: true }).eq("institution_id", inst).is("handled_at", null),
  ]);
  const { units, departments, programmes, years, semesters, ues } = structure;
  // Official results only: courses are attached to teaching units, a few at a time, by search.
  let courseList: CourseRow[] = [];
  if (ues.length && can.manageStudents && mapQuery) {
    const like = `%${mapQuery.replace(/[%_,()]/g, " ")}%`;
    const { data } = await supabase
      .from("courses")
      .select("id, code, title, teaching_unit_id, coefficient, component_weights")
      .eq("institution_id", inst)
      .or(`code.ilike.${like},title.ilike.${like}`)
      .order("code")
      .limit(30);
    courseList = (data ?? []) as CourseRow[];
  }
  const openRequests = reqs.count ?? 0;
  const empty = !units.length && !departments.length;

  const yearLabel = (id: string) => years.find((y) => y.id === id)?.label ?? "";
  const semLabel = (id: string | null) => {
    const s = semesters.find((x) => x.id === id);
    return s ? `${s.label} · ${yearLabel(s.academic_year_id)}` : "—";
  };
  const progName = (id: string | null) => {
    const p = programmes.find((x) => x.id === id);
    return p ? p.code || p.name : "—";
  };

  return (
    <div className="space-y-6">
      <Flash
        error={errorText(t, typeof error === "string" ? error : null)}
        ok={ok ? t.common.saved : null}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <p className="rounded-xl bg-paper px-4 py-3 text-[15px] text-slate-700 ring-1 ring-slate-200">
            {empty ? t.structure.empty : t.structure.byArdoise}
          </p>
          {empty ? null : <StructureTree structure={structure} t={t} />}
        </div>

        <div className="space-y-6">
          <Link href="/admin/requests" className="block">
            <Card lifted className="flex items-center gap-3 p-5 transition-colors hover:border-ardoise">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ardoise text-chalk">
                <MessageSquareText size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{t.schoolRequests.structureLink}</span>
                <span className="block text-[13.5px] text-slate-500">
                  {openRequests ? `${openRequests} ${t.structure.statusOpen.toLowerCase()}` : t.schoolRequests.title}
                </span>
              </span>
            </Card>
          </Link>

          <Section id="calendar" title={t.structure.calendar} icon={<CalendarRange size={17} aria-hidden />}>
            {years.length ? (
              <ul className="space-y-3">
                {years.map((y) => (
                  <li key={y.id}>
                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                      {y.label}
                      {y.is_current ? <Badge tone="brand">{t.structure.current}</Badge> : null}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[14px] text-slate-600">
                      {semesters
                        .filter((s) => s.academic_year_id === y.id)
                        .map((s) => (
                          <li key={s.id}>
                            {s.label}
                            {s.starts_on && s.ends_on ? (
                              <span className="ml-2 text-[12.5px] text-slate-400">
                                {formatDate(locale, s.starts_on)} – {formatDate(locale, s.ends_on)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-slate-500">{t.structure.noYear}</p>
            )}
          </Section>
        </div>
      </div>

      {ues.length ? (
        <Section id="ues" title={t.structure.ues}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[12.5px] text-slate-500">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">{t.common.title}</th>
                  <th className="py-2 pr-3">{t.lmd.credits}</th>
                  <th className="py-2 pr-3">{t.lmd.level}</th>
                  <th className="py-2 pr-3">{t.lmd.programme}</th>
                  <th className="py-2 pr-3">{t.lmd.semester}</th>
                </tr>
              </thead>
              <tbody>
                {ues.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium">{u.code}</td>
                    <td className="py-2 pr-3">{u.title}</td>
                    <td className="num py-2 pr-3">{u.credits}</td>
                    <td className="py-2 pr-3">{u.level ?? "—"}</td>
                    <td className="py-2 pr-3">{progName(u.programme_id)}</td>
                    <td className="py-2 pr-3">{semLabel(u.semester_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {ues.length && can.manageStudents ? (
        <Section id="mapping" title={t.lmd.courseMapping}>
          <p className="text-sm text-slate-500">{t.lmd.courseMappingHelp}</p>
          <form className="flex gap-2" role="search" action="/admin/structure#mapping">
            <Input name="mq" defaultValue={mapQuery} placeholder={t.adminCourses.search} aria-label={t.adminCourses.search} />
            <Button type="submit" variant="secondary">
              {t.teach.searchButton}
            </Button>
          </form>
          {mapQuery && !courseList.length ? <p className="text-sm text-slate-500">{t.adminCourses.none}</p> : null}
          <div className="divide-y divide-slate-100">
            {courseList.map((c) => (
              <form key={c.id} action={mapCourse} className="grid items-end gap-2 py-3 sm:grid-cols-[1.4fr_1.4fr_70px_1.2fr_auto]">
                <input type="hidden" name="course_id" value={c.id} />
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{c.code}</span> <span className="text-slate-600">{c.title}</span>
                </div>
                <Select name="teaching_unit_id" defaultValue={c.teaching_unit_id ?? ""} aria-label={t.lmd.ue}>
                  <option value="">{t.lmd.noUe}</option>
                  {ues.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} · {progName(u.programme_id)} · {semLabel(u.semester_id)}
                    </option>
                  ))}
                </Select>
                <Input name="coefficient" inputMode="decimal" defaultValue={String(c.coefficient)} aria-label={t.lmd.coefficient} />
                <div className="flex gap-1" title={`${t.lmd.weights} — ${t.lmd.weightsHint}`}>
                  {(["cc", "tp", "exam"] as const).map((k) => (
                    <Input
                      key={k}
                      name={`w_${k}`}
                      inputMode="decimal"
                      placeholder={k.toUpperCase()}
                      defaultValue={c.component_weights?.[k] !== undefined ? String(c.component_weights[k]) : ""}
                      aria-label={`${t.lmd.weights} ${k}`}
                    />
                  ))}
                </div>
                <Button type="submit" size="sm" variant="secondary" className="h-10">
                  {t.common.save}
                </Button>
              </form>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
