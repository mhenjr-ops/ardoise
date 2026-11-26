import type { Messages } from "@/lib/i18n/messages";
import { schoolColor, type SchoolLook } from "@/lib/school-look";
import { removeSchoolLogo, saveSchoolProfile, uploadSchoolLogo } from "@/lib/school-look-actions";
import { SchoolMark } from "@/components/school-mark";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";

export type SchoolProfile = SchoolLook & { id: string; city?: string | null; website?: string | null };

/** The university's logo, colour, short name, city and website: for the Ardoise team and for its own administrators. */
export function SchoolLookCard({ school, back, t }: { school: SchoolProfile; back: string; t: Messages }) {
  const hidden = (
    <>
      <input type="hidden" name="institution_id" value={school.id} />
      <input type="hidden" name="back" value={back} />
    </>
  );
  return (
    <Card id="look" className="scroll-mt-6">
      <CardHeader title={t.look.title} />
      <div className="space-y-5 px-5 py-4">
        <p className="text-[14px] text-slate-600">{t.look.intro}</p>

        <div className="flex items-start gap-4">
          <SchoolMark look={school} size={72} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[13.5px] text-slate-500">{school.logo_path ? t.look.logoHelp : t.look.noLogo}</p>
            <form action={uploadSchoolLogo} className="flex flex-wrap items-center gap-2">
              {hidden}
              <input
                type="file"
                name="logo"
                required
                accept="image/png,image/jpeg,image/webp"
                aria-label={t.look.logo}
                className="max-w-full text-[13.5px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[13.5px] file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
              />
              <Button type="submit" size="sm" variant="secondary">
                {t.look.upload}
              </Button>
            </form>
            {school.logo_path ? (
              <form action={removeSchoolLogo}>
                {hidden}
                <button type="submit" className="text-[13px] font-semibold text-terracotta-600 hover:underline">
                  {t.look.remove}
                </button>
              </form>
            ) : (
              <p className="text-[12.5px] text-slate-400">{t.look.logoHelp}</p>
            )}
          </div>
        </div>

        <form action={saveSchoolProfile} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {hidden}
          <Field label={t.look.shortName} hint={t.look.shortNameHelp}>
            <Input name="short_name" defaultValue={school.short_name ?? ""} maxLength={12} />
          </Field>
          <Field label={t.look.color}>
            <span className="flex items-center gap-2">
              <input
                type="color"
                name="brand_color"
                defaultValue={schoolColor(school)}
                aria-label={t.look.color}
                className="h-10 w-14 cursor-pointer rounded-[10px] border border-slate-300 bg-paper p-1"
              />
            </span>
          </Field>
          <Field label={t.look.city}>
            <Input name="city" defaultValue={school.city ?? ""} maxLength={80} />
          </Field>
          <Field label={t.look.website}>
            <Input name="website" defaultValue={school.website ?? ""} maxLength={300} placeholder="https://" inputMode="url" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm">
              {t.common.save}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
