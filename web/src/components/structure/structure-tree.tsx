import type { ReactNode } from "react";
import { Building2, Landmark } from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages-engage";
import type { Department, Programme, Structure, Unit } from "@/lib/structure";
import { Badge } from "@/components/ui";

type Edit = {
  unit: (u: Unit) => ReactNode;
  department: (d: Department) => ReactNode;
  programme: (p: Programme) => ReactNode;
};

const count = (n: number, one: string, many: string) => (n === 1 ? one : fmt(many, { n }));

/**
 * A school's faculties and schools, their departments and programmes.
 * Read-only for the school; the console passes `edit` to add edit controls.
 */
export function StructureTree({ structure, t, edit }: { structure: Pick<Structure, "units" | "departments" | "programmes">; t: Messages; edit?: Edit }) {
  const { units, departments, programmes } = structure;
  const depsOf = (unitId: string | null) => departments.filter((d) => d.faculty_id === unitId);
  const progsOf = (deptId: string) => programmes.filter((p) => p.department_id === deptId);
  const unitIds = new Set(units.map((u) => u.id));
  const loose = departments.filter((d) => !d.faculty_id || !unitIds.has(d.faculty_id));

  const groups: Array<{ title: string; icon: ReactNode; list: Unit[] }> = [
    { title: t.structure.faculties, icon: <Landmark size={17} aria-hidden />, list: units.filter((u) => u.kind !== "school") },
    { title: t.structure.schools, icon: <Building2 size={17} aria-hidden />, list: units.filter((u) => u.kind === "school") },
  ];

  const departmentList = (deps: Department[]) =>
    deps.length ? (
      <ul className="divide-y divide-slate-100">
        {deps.map((d) => {
          const progs = progsOf(d.id);
          return (
            <li key={d.id} className="px-5 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-semibold leading-snug text-slate-800">
                  {d.name}
                  {d.code ? <span className="ml-1.5 text-[13px] font-normal text-slate-400">{d.code}</span> : null}
                </p>
                {edit ? edit.department(d) : null}
              </div>
              {progs.length ? (
                <ul className="mt-1.5 space-y-1 border-l-2 border-ochre-200 pl-3">
                  {progs.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2 text-[14px] text-slate-600">
                      <span>
                        {p.name}
                        {p.code ? <span className="ml-1.5 text-[12.5px] text-slate-400">{p.code}</span> : null}
                        {p.cycle !== "licence" ? (
                          <span className="ml-2 align-middle">
                            <Badge tone="accent">{t.lmd.cycles[p.cycle as keyof typeof t.lmd.cycles] ?? p.cycle}</Badge>
                          </span>
                        ) : null}
                      </span>
                      {edit ? edit.programme(p) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="px-5 py-3 text-[14px] text-slate-500">{t.structure.noDepartments}</p>
    );

  return (
    <div className="space-y-8">
      {groups.map((g) =>
        g.list.length ? (
          <section key={g.title}>
            <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-slate-900">
              <span className="text-brand-600">{g.icon}</span>
              {g.title}
              <span className="text-[15px] font-normal text-slate-400">{g.list.length}</span>
            </h3>
            <div className="gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
              {g.list.map((u) => {
                const deps = depsOf(u.id);
                const nProg = deps.reduce((n, d) => n + progsOf(d.id).length, 0);
                return (
                  <article key={u.id} className="overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-paper">
                    <header className="flex items-start justify-between gap-3 border-b border-slate-200/70 bg-sand/60 px-5 py-3.5">
                      <div className="min-w-0">
                        <h4 className="font-display text-[1.15rem] font-semibold leading-snug text-slate-900">
                          {u.name}
                          {u.code ? <span className="ml-2 align-middle text-[13px] font-bold tracking-wide text-brand-600">{u.code}</span> : null}
                        </h4>
                        <p className="text-[13px] text-slate-500">
                          {count(deps.length, t.structure.departmentsOne, t.structure.departmentsMany)}
                          {nProg ? ` · ${count(nProg, t.structure.programmesOne, t.structure.programmesMany)}` : ""}
                        </p>
                      </div>
                      {edit ? edit.unit(u) : null}
                    </header>
                    {departmentList(deps)}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null,
      )}
      {loose.length ? (
        <section>
          <h3 className="mb-3 font-display text-xl font-semibold text-slate-900">{t.structure.unassigned}</h3>
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-paper">{departmentList(loose)}</div>
        </section>
      ) : null}
    </div>
  );
}
