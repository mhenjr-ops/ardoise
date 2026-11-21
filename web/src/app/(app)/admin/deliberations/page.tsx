import Link from "next/link";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import { one } from "@/lib/deliberation";
import { Badge, Button, Card, CardHeader, Field, Flash, Input, Select } from "@/components/ui";
import { createDeliberation } from "./actions";

type Row = {
  id: string;
  level: string;
  status: "draft" | "locked" | "published";
  computed_at: string | null;
  programme: { name: string; code: string | null } | { name: string; code: string | null }[] | null;
  semester: { label: string; academic_year: { label: string } | { label: string }[] | null } | null;
};

const statusTone = { draft: "neutral", locked: "warn", published: "brand" } as const;

export default async function DeliberationsPage({ searchParams }: PageProps<"/admin/deliberations">) {
  const [{ supabase, institution }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error } = await searchParams;

  const [{ data }, { data: progData }, { data: semData }] = await Promise.all([
    supabase
      .from("deliberations")
      .select("id, level, status, computed_at, programme:programmes(name, code), semester:semesters(label, academic_year:academic_years(label))")
      .eq("institution_id", institution.id)
      .order("created_at", { ascending: false }),
    supabase.from("programmes").select("id, name, code").eq("institution_id", institution.id).order("name"),
    supabase
      .from("semesters")
      .select("id, label, academic_year:academic_years(label, is_current)")
      .eq("institution_id", institution.id)
      .order("label"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const programmes = (progData ?? []) as Array<{ id: string; name: string; code: string | null }>;
  const semesters = ((semData ?? []) as unknown as Array<{ id: string; label: string; academic_year: { label: string; is_current: boolean } | { label: string; is_current: boolean }[] | null }>).map(
    (s) => ({ id: s.id, label: `${s.label} · ${one(s.academic_year)?.label ?? ""}`, current: !!one(s.academic_year)?.is_current }),
  );
  semesters.sort((a, b) => Number(b.current) - Number(a.current) || a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} />
      <Card>
        <CardHeader title={t.lmd.newDeliberation} />
        <form action={createDeliberation} className="grid items-end gap-3 px-5 py-4 sm:grid-cols-[1.5fr_1fr_100px_auto]">
          <Field label={t.lmd.programme}>
            <Select name="programme_id" required>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.lmd.semester}>
            <Select name="semester_id" required>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.lmd.level}>
            <Input name="level" required list="delib-levels" placeholder="L1" />
            <datalist id="delib-levels">
              {["L1", "L2", "L3", "M1", "M2"].map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>
          <Button type="submit" disabled={!programmes.length || !semesters.length}>
            {t.common.create}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={t.lmd.deliberations} />
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t.lmd.noDeliberations}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((d) => {
              const sem = one(d.semester);
              return (
                <li key={d.id}>
                  <Link href={`/admin/deliberations/${d.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                      {one(d.programme)?.name} · {d.level}
                    </span>
                    <span className="text-sm text-slate-600">
                      {sem?.label} · {one(sem?.academic_year)?.label}
                    </span>
                    <span className="text-xs text-slate-400">{d.computed_at ? formatDateTime(locale, d.computed_at) : ""}</span>
                    <Badge tone={statusTone[d.status]}>{t.lmd.status[d.status]}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
