import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Disclosure, Empty, Field, Flash, Input, Textarea } from "@/components/ui";
import type { Announcement } from "@/lib/types";
import { deleteAnnouncement, postAnnouncement } from "./actions";

type Row = Announcement & { author: { full_name: string } | { full_name: string }[] | null };

export default async function AnnouncementsPage({ params, searchParams }: PageProps<"/courses/[courseId]/announcements">) {
  const { courseId } = await params;
  const { error } = await searchParams;
  const [{ supabase, course, isStaff }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);

  const { data } = await supabase
    .from("announcements")
    .select("id, course_id, title, body, author_id, created_at, author:profiles(full_name)")
    .eq("course_id", course.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-4">
      <Flash error={errorText(t, typeof error === "string" ? error : null)} />
      {isStaff ? (
        <Disclosure summary={t.course.newAnnouncement}>
          <form action={postAnnouncement} className="space-y-3">
            <input type="hidden" name="course_id" value={course.id} />
            <Field label={t.common.title}>
              <Input name="title" required />
            </Field>
            <Field label={t.common.description}>
              <Textarea name="body" rows={5} />
            </Field>
            <Button type="submit">{t.course.post}</Button>
          </form>
        </Disclosure>
      ) : null}

      {rows.length === 0 ? (
        <Empty>{t.course.noAnnouncements}</Empty>
      ) : (
        rows.map((a) => {
          const author = Array.isArray(a.author) ? a.author[0] : a.author;
          return (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-900">{a.title}</h2>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(locale, a.created_at)}
                    {author?.full_name ? ` · ${t.course.by} ${author.full_name}` : ""}
                  </p>
                </div>
                {isStaff ? (
                  <form action={deleteAnnouncement}>
                    <input type="hidden" name="course_id" value={course.id} />
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      {t.common.delete}
                    </button>
                  </form>
                ) : null}
              </div>
              <p className="prose-lite mt-3 text-sm text-slate-700">{a.body}</p>
            </Card>
          );
        })
      )}
    </div>
  );
}
