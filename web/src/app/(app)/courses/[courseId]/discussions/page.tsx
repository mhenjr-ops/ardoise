import Link from "next/link";
import { Lock, MessagesSquare, Pin } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { timeAgo } from "@/lib/notifications";
import { nowMs } from "@/lib/format";
import { Avatar, Badge, Button, Card, Disclosure, Empty, Field, Flash, Input, Textarea } from "@/components/ui";
import type { DiscussionTopic } from "@/lib/types";
import { createTopic } from "./actions";

export default async function DiscussionsPage({ params, searchParams }: PageProps<"/courses/[courseId]/discussions">) {
  const { courseId } = await params;
  const sp = await searchParams;
  const [{ supabase, course }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const { data } = await supabase
    .from("discussion_topics")
    .select("id, course_id, title, body, author_id, pinned, locked, reply_count, created_at, last_activity_at, author:profiles(full_name, email)")
    .eq("course_id", course.id)
    .order("pinned", { ascending: false })
    .order("last_activity_at", { ascending: false });
  const topics = (data ?? []) as Array<DiscussionTopic & { author: { full_name: string; email: string } | { full_name: string; email: string }[] | null }>;
  const now = nowMs();

  return (
    <div className="space-y-5">
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />
      <Disclosure summary={t.discussions.newTopic}>
        <form action={createTopic} className="space-y-3">
          <input type="hidden" name="course_id" value={course.id} />
          <Field label={t.discussions.topicTitle}>
            <Input name="title" required maxLength={200} />
          </Field>
          <Field label={t.discussions.body}>
            <Textarea name="body" rows={5} />
          </Field>
          <Button type="submit">{t.discussions.post}</Button>
        </form>
      </Disclosure>

      {topics.length === 0 ? (
        <Empty>{t.discussions.empty}</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {topics.map((topic) => {
              const a = Array.isArray(topic.author) ? topic.author[0] : topic.author;
              const name = a?.full_name || a?.email || "?";
              return (
                <li key={topic.id}>
                  <Link href={`/courses/${course.id}/discussions/${topic.id}`} className="flex gap-4 px-5 py-4 hover:bg-slate-50">
                    <Avatar name={name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {topic.pinned ? (
                          <Badge tone="accent">
                            <Pin size={11} aria-hidden />
                            {t.discussions.pinned}
                          </Badge>
                        ) : null}
                        {topic.locked ? (
                          <Badge>
                            <Lock size={11} aria-hidden />
                            {t.discussions.locked}
                          </Badge>
                        ) : null}
                        <h3 className="text-[16px] font-bold text-slate-900">{topic.title}</h3>
                      </div>
                      {topic.body ? <p className="mt-0.5 line-clamp-2 text-[14.5px] text-slate-600">{topic.body}</p> : null}
                      <p className="mt-1 text-[12.5px] text-slate-500">
                        {fmt(t.discussions.startedBy, { name })}, {timeAgo(locale, topic.created_at, now)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <span className="inline-flex items-center gap-1 text-[14px] font-bold text-slate-700">
                        <MessagesSquare size={15} aria-hidden className="text-slate-400" />
                        <span className="num">{topic.reply_count}</span>
                      </span>
                      <span className="text-[12px] text-slate-500">{timeAgo(locale, topic.last_activity_at, now)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
