import { notFound } from "next/navigation";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Disclosure, Field, Flash, Input, Textarea } from "@/components/ui";
import type { Page } from "@/lib/types";
import { savePage } from "./actions";

export default async function CoursePage({ params, searchParams }: PageProps<"/courses/[courseId]/pages/[pageId]">) {
  const { courseId, pageId } = await params;
  const { error, ok } = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const { data } = await supabase
    .from("pages")
    .select("id, course_id, title, body, published, updated_at")
    .eq("id", pageId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!data) notFound();
  const page = data as Page;

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={ok ? t.common.saved : null} />
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{page.title}</h2>
          {!page.published ? <Badge tone="warn">{t.common.unpublished}</Badge> : null}
        </div>
        <article className="prose-lite text-[15px] text-slate-800">{page.body}</article>
        <p className="mt-6 text-xs text-slate-400">{formatDateTime(locale, page.updated_at)}</p>
      </Card>

      {isStaff ? (
        <Disclosure summary={t.common.edit}>
          <form action={savePage} className="space-y-3">
            <input type="hidden" name="course_id" value={course.id} />
            <input type="hidden" name="id" value={page.id} />
            <Field label={t.common.title}>
              <Input name="title" defaultValue={page.title} required />
            </Field>
            <Field label={t.modules.newPageBody}>
              <Textarea name="body" defaultValue={page.body} rows={14} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" defaultChecked={page.published} className="h-4 w-4 accent-brand-600" />
              {t.common.published}
            </label>
            <Button type="submit">{t.common.save}</Button>
          </form>
        </Disclosure>
      ) : null}
    </div>
  );
}
