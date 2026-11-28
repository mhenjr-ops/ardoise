import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Search, UsersRound } from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages-engage";
import { Badge, Button, Card, Disclosure, Field, Input, Select, buttonClass, cx } from "@/components/ui";
import { CatalogueImport } from "./catalogue-import";
import {
  importCatalogue,
  leaveTaughtCourse,
  retireCatalogueCourse,
  saveCatalogueCourse,
  teachCatalogueCourse,
} from "@/lib/catalogue-actions";

const PER_PAGE = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YEARS = [1, 2, 3, 4, 5, 6, 7, 8];

type Row = {
  id: string;
  code: string;
  title: string;
  level: number | null;
  semester_no: number | null;
  credits: number | null;
  departments: string;
  department_ids: string[];
  retired: boolean;
  course_id: string | null;
  teachers: string;
  teaching: boolean;
  students: number;
  total: number;
};
type Dept = { id: string; name: string; faculty: string };
type Search = Record<string, string | string[] | undefined>;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const param = (sp: Search, k: string, max = 80) => (typeof sp[k] === "string" ? (sp[k] as string).trim().slice(0, max) : "");

/**
 * The school's course catalogue. "teach" is the lecturer's view (claim a course, add a missing
 * one); "manage" is the registrar's, department head's or Ardoise team's (edit, retire, import).
 */
export async function CatalogueBrowser({
  supabase,
  t,
  institutionId,
  mode,
  basePath,
  searchParams,
  myDepartment,
  isTeam = false,
}: {
  supabase: SupabaseClient;
  t: Messages;
  institutionId: string;
  mode: "teach" | "manage";
  basePath: string;
  searchParams: Search;
  myDepartment?: string | null;
  isTeam?: boolean;
}) {
  const c = t.catalogue;
  const q = param(searchParams, "q");
  const deptParam = param(searchParams, "dept", 40);
  // A lecturer starts in their own department; "all" shows every department.
  const dept = UUID.test(deptParam) ? deptParam : deptParam === "all" ? "" : mode === "teach" ? (myDepartment ?? "") : "";
  const yearN = Number(param(searchParams, "year", 2));
  const year = YEARS.includes(yearN) ? yearN : null;
  const semN = Number(param(searchParams, "sem", 2));
  const sem = semN === 1 || semN === 2 ? semN : null;
  const mine = mode === "teach" && param(searchParams, "mine", 2) === "1";
  const pageN = Math.max(1, Math.min(1000, Number(param(searchParams, "page", 4)) || 1));

  const [{ data: found, error }, { data: deptRows }] = await Promise.all([
    supabase.rpc("catalogue_search", {
      p_institution: institutionId,
      p_query: q,
      p_department: dept || null,
      p_level: year,
      p_semester: sem,
      p_mine: mine,
      p_offset: (pageN - 1) * PER_PAGE,
      p_limit: PER_PAGE,
    }),
    supabase.from("departments").select("id, name, faculty:faculties(name, code)").eq("institution_id", institutionId).order("name"),
  ]);
  const rows = (error ? [] : (found ?? [])) as Row[];
  const total = rows[0]?.total ?? 0;
  const departments: Dept[] = ((deptRows ?? []) as Array<{ id: string; name: string; faculty: { name: string; code: string | null } | { name: string; code: string | null }[] | null }>)
    .map((d) => {
      const f = one(d.faculty);
      return { id: d.id, name: d.name, faculty: f?.code || f?.name || "" };
    })
    .sort((a, b) => a.faculty.localeCompare(b.faculty) || a.name.localeCompare(b.name));
  const byFaculty = [...new Set(departments.map((d) => d.faculty))].map((f) => ({ faculty: f, items: departments.filter((d) => d.faculty === f) }));

  // Keeps the filters when a form on this page sends the user back.
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (deptParam) qs.set("dept", deptParam);
  if (year) qs.set("year", String(year));
  if (sem) qs.set("sem", String(sem));
  if (mine) qs.set("mine", "1");
  if (pageN > 1) qs.set("page", String(pageN));
  const pageHref = (p: number) => {
    const next = new URLSearchParams(qs);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return `${basePath}?${next}`;
  };
  const hidden = (extra?: Record<string, string>) => (
    <>
      <input type="hidden" name="back" value={basePath} />
      <input type="hidden" name="qs" value={qs.toString()} />
      <input type="hidden" name="institution_id" value={institutionId} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );

  const deptOptions = () =>
    byFaculty.map((g) => (
      <optgroup key={g.faculty || "-"} label={g.faculty || "—"}>
        {g.items.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </optgroup>
    ));

  const courseFields = (r?: Row, selectedDepts: string[] = []) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={c.code}>
        <Input name="code" required maxLength={40} defaultValue={r?.code} placeholder="CVLE2101" />
      </Field>
      <Field label={c.courseTitle}>
        <Input name="title" required maxLength={300} defaultValue={r?.title} />
      </Field>
      <Field label={c.yearLabel}>
        <Select name="level" defaultValue={r?.level ? String(r.level) : (year ? String(year) : "")}>
          <option value="">{c.notSet}</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {fmt(c.year, { n: y })}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={c.semesterLabel}>
        <Select name="semester" defaultValue={r?.semester_no ? String(r.semester_no) : (sem ? String(sem) : "")}>
          <option value="">{c.notSet}</option>
          <option value="1">{fmt(c.semester, { n: 1 })}</option>
          <option value="2">{fmt(c.semester, { n: 2 })}</option>
        </Select>
      </Field>
      <Field label={c.creditsLabel}>
        <Input name="credits" inputMode="decimal" maxLength={4} defaultValue={r?.credits ?? ""} />
      </Field>
      {mode === "manage" ? (
        <Field label={c.departmentsLabel} hint={c.departmentsHint}>
          <select
            name="departments"
            multiple
            size={6}
            defaultValue={selectedDepts}
            className="w-full rounded-[10px] border border-slate-300 bg-white px-2 py-1.5 text-[14.5px]"
          >
            {deptOptions()}
          </select>
        </Field>
      ) : (
        <Field label={c.departmentLabel}>
          <Select name="departments" defaultValue={dept || myDepartment || ""}>
            <option value="">{c.notSet}</option>
            {deptOptions()}
          </Select>
        </Field>
      )}
    </div>
  );

  const meta = (r: Row) =>
    [
      r.departments,
      r.level ? fmt(c.year, { n: r.level }) : null,
      r.semester_no ? fmt(c.semester, { n: r.semester_no }) : null,
      r.credits ? fmt(c.credits, { n: Number(r.credits) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-5">
      {mode === "manage" ? (
        <Disclosure summary={c.importTitle} open={total === 0 && !q && !dept && !year && !sem}>
          <p className="mb-2 text-[14.5px] leading-relaxed text-slate-600">{c.importBody}</p>
          {isTeam ? <p className="mb-3 text-[13.5px] text-slate-500">{c.importTeamNote}</p> : null}
          <CatalogueImport
            institutionId={institutionId}
            action={importCatalogue}
            labels={{
              chooseFile: c.chooseFile,
              reading: c.reading,
              found: c.found,
              detected: c.detected,
              noData: c.noData,
              badFile: c.badFile,
              importAll: c.importAll,
              progress: c.progress,
              result: c.result,
              unknownDeps: c.unknownDeps,
              error: c.error,
              columns: c.columns,
            }}
          />
        </Disclosure>
      ) : null}

      <form className="flex flex-wrap items-end gap-2" role="search" action={basePath}>
        <div className="relative min-w-[200px] flex-[2]">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={c.search} aria-label={c.search} className="pl-9" />
        </div>
        <Select name="dept" defaultValue={dept || "all"} aria-label={c.departmentLabel} className="min-w-[180px] flex-[2]">
          <option value="all">{c.allDepartments}</option>
          {byFaculty.map((g) => (
            <optgroup key={g.faculty || "-"} label={g.faculty || "—"}>
              {g.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === myDepartment ? `${d.name} (${c.myDepartment})` : d.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select name="year" defaultValue={year ? String(year) : ""} aria-label={c.yearLabel} className="w-auto flex-1">
          <option value="">{c.allYears}</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {fmt(c.year, { n: y })}
            </option>
          ))}
        </Select>
        <Select name="sem" defaultValue={sem ? String(sem) : ""} aria-label={c.semesterLabel} className="w-auto flex-1">
          <option value="">{c.allSemesters}</option>
          <option value="1">{fmt(c.semester, { n: 1 })}</option>
          <option value="2">{fmt(c.semester, { n: 2 })}</option>
        </Select>
        {mode === "teach" ? (
          <label className="flex h-10 items-center gap-2 px-1 text-[14px] text-slate-700">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-4 w-4 accent-ardoise" />
            {c.mine}
          </label>
        ) : null}
        <Button type="submit" variant="secondary">
          {c.filter}
        </Button>
      </form>

      <p className="text-[13.5px] text-slate-500">
        {total ? fmt(c.page, { from: (pageN - 1) * PER_PAGE + 1, to: (pageN - 1) * PER_PAGE + rows.length, total }) : null}
      </p>

      {rows.length ? (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className={cx("px-5 py-3.5", r.retired && "bg-slate-50")}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      <span className="mr-2 text-brand-600">{r.code}</span>
                      {r.title}
                      {r.retired ? (
                        <span className="ml-2 align-middle">
                          <Badge tone="neutral">{c.retired}</Badge>
                        </span>
                      ) : null}
                    </p>
                    {meta(r) ? <p className="text-[13.5px] text-slate-500">{meta(r)}</p> : null}
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-slate-600">
                      <UsersRound size={14} className="shrink-0 text-slate-400" aria-hidden />
                      {r.course_id
                        ? [r.teachers ? fmt(c.taughtBy, { names: r.teachers }) : t.teach.noTeacher, fmt(c.students, { n: r.students })].join(" · ")
                        : c.notOpened}
                    </p>
                  </div>
                  {mode === "teach" ? (
                    r.teaching && r.course_id ? (
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/courses/${r.course_id}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1 text-[13px] font-semibold text-leaf-700 ring-1 ring-leaf-100"
                        >
                          <Check size={14} aria-hidden />
                          {t.teach.onDashboard}
                        </Link>
                        <form action={leaveTaughtCourse}>
                          {hidden({ course_id: r.course_id })}
                          <button type="submit" className="text-[13px] font-semibold text-slate-500 hover:text-terracotta-600">
                            {t.teach.leave}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <form action={teachCatalogueCourse}>
                        {hidden({ id: r.id })}
                        <Button type="submit" size="sm">
                          {t.teach.iTeach}
                        </Button>
                      </form>
                    )
                  ) : r.course_id ? (
                    <Link href={`/courses/${r.course_id}`} className={buttonClass("ghost", "sm")}>
                      {c.openCourse}
                    </Link>
                  ) : null}
                </div>
                {mode === "manage" ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13.5px] font-semibold text-brand-600 hover:underline">{c.edit}</summary>
                    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-paper p-4">
                      <form action={saveCatalogueCourse} className="space-y-3">
                        {hidden({ id: r.id })}
                        {courseFields(r, r.department_ids ?? [])}
                        <Button type="submit" size="sm">
                          {c.save}
                        </Button>
                      </form>
                      <form action={retireCatalogueCourse} className="border-t border-slate-200 pt-3">
                        {hidden({ id: r.id, retire: r.retired ? "0" : "1" })}
                        <Button type="submit" size="sm" variant={r.retired ? "secondary" : "danger"}>
                          {r.retired ? c.restore : c.retire}
                        </Button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-6 text-[15px] text-slate-600">{c.none}</Card>
      )}

      {total > PER_PAGE ? (
        <nav className="flex items-center justify-between text-[14.5px]">
          {pageN > 1 ? (
            <Link href={pageHref(pageN - 1)} className={buttonClass("secondary", "sm")}>
              {c.previous}
            </Link>
          ) : (
            <span />
          )}
          {pageN * PER_PAGE < total ? (
            <Link href={pageHref(pageN + 1)} className={buttonClass("secondary", "sm")}>
              {c.next}
            </Link>
          ) : null}
        </nav>
      ) : null}

      <Card id="add" className="scroll-mt-6 p-5">
        <h2 className="font-display text-xl font-semibold text-slate-900">{mode === "teach" ? c.missingTitle : c.addTitle}</h2>
        {mode === "teach" ? <p className="mb-4 mt-1 text-[14.5px] text-slate-600">{c.missingHelp}</p> : <div className="mb-4" />}
        <form action={saveCatalogueCourse} className="space-y-4">
          {hidden(mode === "teach" ? { teach: "1" } : undefined)}
          {courseFields()}
          <Button type="submit">{mode === "teach" ? c.addAndTeach : c.add}</Button>
        </form>
      </Card>
    </div>
  );
}
