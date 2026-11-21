import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fetchAll } from "@/lib/fetch-all";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, Select, Textarea } from "@/components/ui";
import { registerStudents, removeEnrollment } from "./actions";

type Row = {
  id: string;
  level: string;
  student: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};

export default async function EnrollmentsPage({ searchParams }: PageProps<"/admin/enrollments">) {
  const [{ supabase, institution }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const q = await searchParams;
  const [{ data: progData }, { data: yearData }] = await Promise.all([
    supabase.from("programmes").select("id, name, code").eq("institution_id", institution.id).order("name"),
    supabase.from("academic_years").select("id, label, is_current").eq("institution_id", institution.id).order("label", { ascending: false }),
  ]);
  const programmes = (progData ?? []) as Array<{ id: string; name: string; code: string | null }>;
  const years = (yearData ?? []) as Array<{ id: string; label: string; is_current: boolean }>;

  const programmeId = typeof q.programme === "string" && programmes.some((p) => p.id === q.programme) ? q.programme : programmes[0]?.id;
  const yearId =
    typeof q.year === "string" && years.some((y) => y.id === q.year) ? q.year : (years.find((y) => y.is_current) ?? years[0])?.id;

  const rows =
    programmeId && yearId
      ? await fetchAll<Row>((from, to) =>
          supabase
            .from("programme_enrollments")
            .select("id, level, student:profiles(full_name, email)")
            .eq("programme_id", programmeId)
            .eq("academic_year_id", yearId)
            .range(from, to),
        )
      : [];
  const list = rows
    .map((r) => {
      const p = Array.isArray(r.student) ? r.student[0] : r.student;
      return { id: r.id, level: r.level, name: p?.full_name || p?.email || "", email: p?.email ?? "" };
    })
    .sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name, locale));

  const added = typeof q.added === "string" ? Number(q.added) : null;
  const missing = typeof q.missing === "string" ? q.missing.split(",") : [];
  const back = `/admin/enrollments?programme=${programmeId ?? ""}&year=${yearId ?? ""}`;

  if (!programmes.length || !years.length) return <Empty>{t.lmd.noUesForDelib}</Empty>;

  return (
    <div className="space-y-6">
      <Flash
        error={errorText(t, typeof q.error === "string" ? q.error : null)}
        ok={added !== null ? `${added} ${t.lmd.registered}` : null}
      />
      {missing.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t.lmd.notFound} {missing.join(", ")}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title={t.lmd.register} />
          <form action={registerStudents} className="space-y-3 px-5 py-4">
            <Field label={t.lmd.programme}>
              <Select name="programme_id" defaultValue={programmeId}>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.lmd.year}>
                <Select name="academic_year_id" defaultValue={yearId}>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.lmd.level}>
                <Input name="level" required list="enroll-levels" placeholder="L1" />
                <datalist id="enroll-levels">
                  {["L1", "L2", "L3", "M1", "M2"].map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label={t.lmd.emails} hint={t.people.addHelp}>
              <Textarea name="emails" rows={8} required placeholder={"brenda@exemple.cm\ncedric@exemple.cm"} />
            </Field>
            <Button type="submit">{t.common.add}</Button>
          </form>
        </Card>

        <Card>
          <CardHeader
            title={`${t.lmd.enrolled} (${list.length})`}
            action={
              <form className="flex gap-2" method="get">
                <Select name="programme" defaultValue={programmeId} className="h-8 py-0 text-xs">
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code || p.name}
                    </option>
                  ))}
                </Select>
                <Select name="year" defaultValue={yearId} className="h-8 py-0 text-xs">
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" variant="secondary">
                  {t.lmd.filter}
                </Button>
              </form>
            }
          />
          <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                <Badge tone="info">{s.level}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                  <p className="truncate text-xs text-slate-500">{s.email}</p>
                </div>
                <form action={removeEnrollment}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                    {t.modules.remove}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
