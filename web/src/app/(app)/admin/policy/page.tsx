import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { toPolicy } from "@/lib/lmd";
import { Button, Card, Field, Flash, Input, Select } from "@/components/ui";
import { savePolicy } from "./actions";

export default async function PolicyPage({ searchParams }: PageProps<"/admin/policy">) {
  const [{ supabase, institution }, { t }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error, ok } = await searchParams;
  const { data } = await supabase.from("grading_policies").select("*").eq("institution_id", institution.id).maybeSingle();
  const p = toPolicy(data);

  return (
    <div className="max-w-2xl space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />
      <p className="text-sm text-slate-500">{t.lmd.policyNote}</p>
      <Card className="p-5">
        <form action={savePolicy} className="space-y-5">
          <input type="hidden" name="institution_id" value={institution.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.lmd.passMark}>
              <Input name="pass_mark" inputMode="decimal" defaultValue={String(p.pass_mark)} required />
            </Field>
            <Field label={t.lmd.eliminationMark}>
              <Input name="elimination_mark" inputMode="decimal" defaultValue={String(p.elimination_mark)} required />
            </Field>
            <Field label={t.lmd.resitRule}>
              <Select name="resit_rule" defaultValue={p.resit_rule}>
                <option value="replace">{t.lmd.resitRules.replace}</option>
                <option value="max">{t.lmd.resitRules.max}</option>
              </Select>
            </Field>
            <Field label={t.lmd.juryMaxBonus}>
              <Input name="jury_max_bonus" inputMode="decimal" defaultValue={String(p.jury_max_bonus)} required />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ue_compensation" defaultChecked={p.ue_compensation} className="h-4 w-4 accent-brand-600" />
            {t.lmd.compensation}
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">{t.lmd.componentWeights}</legend>
            <div className="grid grid-cols-3 gap-3">
              {(["cc", "tp", "exam"] as const).map((k) => (
                <Field key={k} label={k === "cc" ? t.assignments.components.cc : k === "tp" ? t.assignments.components.tp : t.assignments.components.exam}>
                  <Input name={`w_${k}`} inputMode="decimal" defaultValue={String(p.component_weights[k] ?? 0)} />
                </Field>
              ))}
            </div>
          </fieldset>
          <Button type="submit">{t.common.save}</Button>
        </form>
      </Card>
    </div>
  );
}
