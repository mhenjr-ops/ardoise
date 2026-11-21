import type { ReactNode } from "react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { Badge, Button, Card, CardHeader, Field, Flash, Input, Select } from "@/components/ui";
import { createRecord, deleteUE, mapCourse } from "./actions";

type Named = { id: string; name: string; code: string | null };
type Year = { id: string; label: string; is_current: boolean };
type Semester = { id: string; label: string; academic_year_id: string };
type UE = { id: string; code: string; title: string; credits: number; level: string | null; programme_id: string | null; semester_id: string | null };
type CourseRow = {
  id: string;
  code: string;
  title: string;
  teaching_unit_id: string | null;
  coefficient: number;
  component_weights: Record<string, number> | null;
};

const LEVELS = ["L1", "L2", "L3", "M1", "M2", "D1", "D2", "D3"];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader title={title} />
      <div className="space-y-4 px-5 py-4">{children}</div>
    </Card>
  );
}

function Hidden({ kind, institutionId }: { kind: string; institutionId: string }) {
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="institution_id" value={institutionId} />
    </>
  );
}

export default async function StructurePage({ searchParams }: PageProps<"/admin/structure">) {
  const [{ supabase, institution }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error, ok } = await searchParams;
  const inst = institution.id;

  const [fac, dep, prog, years, sems, ues, courses] = await Promise.all([
    supabase.from("faculties").select("id, name, code").eq("institution_id", inst).order("name"),
    supabase.from("departments").select("id, name, code, faculty_id").eq("institution_id", inst).order("name"),
    supabase.from("programmes").select("id, name, code, department_id, cycle").eq("institution_id", inst).order("name"),
    supabase.from("academic_years").select("id, label, is_current").eq("institution_id", inst).order("label", { ascending: false }),
    supabase.from("semesters").select("id, label, academic_year_id").eq("institution_id", inst).order("label"),
    supabase.from("teaching_units").select("id, code, title, credits, level, programme_id, semester_id").eq("institution_id", inst).order("code"),
    supabase
      .from("courses")
      .select("id, code, title, teaching_unit_id, coefficient, component_weights")
      .eq("institution_id", inst)
      .order("code"),
  ]);
  const faculties = (fac.data ?? []) as Named[];
  const departments = (dep.data ?? []) as Array<Named & { faculty_id: string | null }>;
  const programmes = (prog.data ?? []) as Array<Named & { department_id: string | null; cycle: string }>;
  const yearList = (years.data ?? []) as Year[];
  const semesters = (sems.data ?? []) as Semester[];
  const ueList = (ues.data ?? []) as UE[];
  const courseList = (courses.data ?? []) as CourseRow[];

  const yearLabel = (id: string) => yearList.find((y) => y.id === id)?.label ?? "";
  const semLabel = (id: string | null) => {
    const s = semesters.find((x) => x.id === id);
    return s ? `${s.label} · ${yearLabel(s.academic_year_id)}` : "—";
  };
  const progName = (id: string | null) => programmes.find((p) => p.id === id)?.code || programmes.find((p) => p.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section id="faculty" title={t.lmd.faculties}>
          <ul className="space-y-1 text-sm">
            {faculties.map((f) => (
              <li key={f.id}>
                {f.name} {f.code ? <span className="text-slate-400">({f.code})</span> : null}
              </li>
            ))}
          </ul>
          <form action={createRecord} className="space-y-2">
            <Hidden kind="faculty" institutionId={inst} />
            <Input name="name" required placeholder={t.lmd.faculty} />
            <div className="flex gap-2">
              <Input name="code" placeholder="FS" />
              <Button type="submit" size="sm" className="h-10">
                {t.common.add}
              </Button>
            </div>
          </form>
        </Section>

        <Section id="department" title={t.lmd.departments}>
          <ul className="space-y-1 text-sm">
            {departments.map((d) => (
              <li key={d.id}>
                {d.name} <span className="text-slate-400">{faculties.find((f) => f.id === d.faculty_id)?.code ?? ""}</span>
              </li>
            ))}
          </ul>
          <form action={createRecord} className="space-y-2">
            <Hidden kind="department" institutionId={inst} />
            <Select name="faculty_id" defaultValue="">
              <option value="">{t.lmd.faculty}…</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Input name="name" required placeholder={t.lmd.department} />
            <div className="flex gap-2">
              <Input name="code" placeholder="INFO" />
              <Button type="submit" size="sm" className="h-10">
                {t.common.add}
              </Button>
            </div>
          </form>
        </Section>

        <Section id="programme" title={t.lmd.programmes}>
          <ul className="space-y-1 text-sm">
            {programmes.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {p.name} {p.code ? <span className="text-slate-400">({p.code})</span> : null}
                </span>
                <Badge>{t.lmd.cycles[p.cycle as keyof typeof t.lmd.cycles] ?? p.cycle}</Badge>
              </li>
            ))}
          </ul>
          <form action={createRecord} className="space-y-2">
            <Hidden kind="programme" institutionId={inst} />
            <Select name="department_id" defaultValue="">
              <option value="">{t.lmd.department}…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Input name="name" required placeholder="Licence Informatique" />
            <div className="flex gap-2">
              <Input name="code" placeholder="LINF" />
              <Select name="cycle" defaultValue="licence">
                {(["licence", "master", "doctorat", "other"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t.lmd.cycles[c]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" size="sm">
              {t.common.add}
            </Button>
          </form>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="year" title={t.lmd.years}>
          <ul className="space-y-1 text-sm">
            {yearList.map((y) => (
              <li key={y.id} className="flex items-center gap-2">
                <span>{y.label}</span>
                {y.is_current ? <Badge tone="brand">{t.lmd.current}</Badge> : null}
                <span className="text-xs text-slate-400">
                  {semesters
                    .filter((s) => s.academic_year_id === y.id)
                    .map((s) => s.label)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <form action={createRecord} className="grid gap-2 sm:grid-cols-2">
            <Hidden kind="year" institutionId={inst} />
            <Input name="label" required placeholder="2026-2027" className="sm:col-span-2" />
            <Field label={t.lmd.startsOn}>
              <Input name="starts_on" type="date" />
            </Field>
            <Field label={t.lmd.endsOn}>
              <Input name="ends_on" type="date" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_current" className="h-4 w-4 accent-brand-600" />
              {t.lmd.current}
            </label>
            <Button type="submit" size="sm">
              {t.common.add}
            </Button>
          </form>
        </Section>

        <Section id="semester" title={t.lmd.semesters}>
          <form action={createRecord} className="flex flex-col gap-2 sm:flex-row">
            <Hidden kind="semester" institutionId={inst} />
            <Select name="academic_year_id" required defaultValue={yearList.find((y) => y.is_current)?.id ?? yearList[0]?.id}>
              {yearList.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </Select>
            <Input name="label" required placeholder="S1" />
            <Button type="submit" size="sm" className="h-10" disabled={yearList.length === 0}>
              {t.common.add}
            </Button>
          </form>
        </Section>
      </div>

      <Section id="ues" title={t.lmd.ues}>
        {ueList.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">{t.common.title}</th>
                  <th className="py-2 pr-3">{t.lmd.credits}</th>
                  <th className="py-2 pr-3">{t.lmd.level}</th>
                  <th className="py-2 pr-3">{t.lmd.programme}</th>
                  <th className="py-2 pr-3">{t.lmd.semester}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ueList.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium">{u.code}</td>
                    <td className="py-2 pr-3">{u.title}</td>
                    <td className="py-2 pr-3">{u.credits}</td>
                    <td className="py-2 pr-3">{u.level ?? "—"}</td>
                    <td className="py-2 pr-3">{progName(u.programme_id)}</td>
                    <td className="py-2 pr-3">{semLabel(u.semester_id)}</td>
                    <td className="py-2 text-right">
                      <form action={deleteUE}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                          {t.common.delete}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <form action={createRecord} className="grid gap-2 sm:grid-cols-6">
          <Hidden kind="ue" institutionId={inst} />
          <Input name="code" required placeholder="INF111" />
          <Input name="title" required placeholder="Algorithmique" className="sm:col-span-2" />
          <Input name="credits" type="number" min="0" max="60" required placeholder={t.lmd.credits} />
          <Input name="level" list="levels" placeholder={t.lmd.level} />
          <datalist id="levels">
            {LEVELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <Select name="programme_id" required>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code || p.name}
              </option>
            ))}
          </Select>
          <Select name="semester_id" required className="sm:col-span-2">
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {semLabel(s.id)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" className="h-10" disabled={!programmes.length || !semesters.length}>
            {t.common.add}
          </Button>
        </form>
      </Section>

      <Section id="mapping" title={t.lmd.courseMapping}>
        <p className="text-sm text-slate-500">{t.lmd.courseMappingHelp}</p>
        <div className="divide-y divide-slate-100">
          {courseList.map((c) => (
            <form key={c.id} action={mapCourse} className="grid items-end gap-2 py-3 sm:grid-cols-[1.4fr_1.4fr_70px_1.2fr_auto]">
              <input type="hidden" name="course_id" value={c.id} />
              <div className="min-w-0 text-sm">
                <span className="font-medium">{c.code}</span> <span className="text-slate-600">{c.title}</span>
              </div>
              <Select name="teaching_unit_id" defaultValue={c.teaching_unit_id ?? ""} aria-label={t.lmd.ue}>
                <option value="">{t.lmd.noUe}</option>
                {ueList.map((u) => (
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
    </div>
  );
}
