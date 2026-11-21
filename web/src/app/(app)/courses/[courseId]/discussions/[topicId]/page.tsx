import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pin, Trash2 } from "lucide-react";
import { getCourseContext } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDateTime } from "@/lib/format";
import { Avatar, Badge, Button, Card, Flash, Textarea, cx } from "@/components/ui";
import type { DiscussionReply, DiscussionTopic } from "@/lib/types";
import type { Locale, Messages } from "@/lib/i18n/messages";
import { deleteReply, deleteTopic, moderateTopic, postReply } from "../actions";

type Person = { full_name: string; email: string };
const nameOf = (p: Person | Person[] | null | undefined) => {
  const x = Array.isArray(p) ? p[0] : p;
  return x?.full_name || x?.email || "?";
};

type ReplyRow = DiscussionReply & { author: Person | Person[] | null };
type ReplyCtx = {
  replies: ReplyRow[];
  canPost: boolean;
  isStaff: boolean;
  userId: string;
  courseId: string;
  topicId: string;
  t: Messages;
  locale: Locale;
};

function ReplyItem({ r, depth, ctx }: { r: ReplyRow; depth: number; ctx: ReplyCtx }) {
  const { t, locale, canPost, isStaff, userId } = ctx;
  const base = { course_id: ctx.courseId, topic_id: ctx.topicId };
  const children = ctx.replies.filter((x) => x.parent_id === r.id);
  return (
    <li id={`r-${r.id}`} className={cx("scroll-mt-24", depth > 0 && "ml-6 border-l-2 border-slate-200 pl-4 sm:ml-12")}>
      <div className="flex gap-3 py-3">
        <Avatar name={nameOf(r.author)} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-slate-500">
            <span className="font-bold text-slate-800">{nameOf(r.author)}</span> {formatDateTime(locale, r.created_at)}
          </p>
          <p className="prose-lite mt-1 text-[15.5px] text-slate-800">{r.body}</p>
          <div className="mt-1.5 flex items-center gap-3">
            {canPost && depth === 0 ? (
              <details className="group">
                <summary className="cursor-pointer list-none text-[13px] font-semibold text-brand-600 hover:underline [&::-webkit-details-marker]:hidden">
                  {t.discussions.reply}
                </summary>
                <form action={postReply} className="mt-2 flex items-end gap-2">
                  <input type="hidden" name="course_id" value={base.course_id} />
                  <input type="hidden" name="topic_id" value={base.topic_id} />
                  <input type="hidden" name="parent_id" value={r.id} />
                  <Textarea name="body" required rows={2} className="min-h-16 min-w-[16rem]" placeholder={fmt(t.discussions.replyTo, { name: nameOf(r.author) })} />
                  <Button type="submit" size="sm">
                    {t.discussions.post}
                  </Button>
                </form>
              </details>
            ) : null}
            {isStaff || r.author_id === userId ? (
              <form action={deleteReply}>
                <input type="hidden" name="course_id" value={base.course_id} />
                <input type="hidden" name="topic_id" value={base.topic_id} />
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="text-[12.5px] font-semibold text-slate-400 hover:text-terracotta-600">
                  {t.discussions.deleteReply}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
      {children.length ? (
        <ul>
          {children.map((c) => (
            <ReplyItem key={c.id} r={c} depth={depth + 1} ctx={ctx} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default async function TopicPage({ params, searchParams }: PageProps<"/courses/[courseId]/discussions/[topicId]">) {
  const { courseId, topicId } = await params;
  const sp = await searchParams;
  const [{ supabase, course, isStaff, user }, { t, locale }] = await Promise.all([getCourseContext(courseId), getI18n()]);
  const { data } = await supabase
    .from("discussion_topics")
    .select("id, course_id, title, body, author_id, pinned, locked, reply_count, created_at, last_activity_at, author:profiles(full_name, email)")
    .eq("id", topicId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!data) notFound();
  const topic = data as DiscussionTopic & { author: Person | Person[] | null };
  const { data: replyRows } = await supabase
    .from("discussion_replies")
    .select("id, topic_id, parent_id, author_id, body, created_at, edited_at, author:profiles(full_name, email)")
    .eq("topic_id", topic.id)
    .order("created_at");
  const replies = (replyRows ?? []) as ReplyRow[];
  const roots = replies.filter((r) => !r.parent_id);
  const canPost = !topic.locked || isStaff;
  const base = { course_id: course.id, topic_id: topic.id };
  const ctx: ReplyCtx = { replies, canPost, isStaff, userId: user.id, courseId: course.id, topicId: topic.id, t, locale };

  return (
    <div className="space-y-5">
      <Link href={`/courses/${course.id}/discussions`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={15} aria-hidden />
        {t.discussions.title}
      </Link>
      <Flash error={errorText(t, typeof sp.error === "string" ? sp.error : null)} />

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
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
            </div>
            <h2 className="font-display text-[1.8rem] font-semibold leading-tight">{topic.title}</h2>
            <div className="mt-2 flex items-center gap-2.5">
              <Avatar name={nameOf(topic.author)} size={28} />
              <p className="text-[13.5px] text-slate-500">
                <span className="font-bold text-slate-800">{nameOf(topic.author)}</span> {formatDateTime(locale, topic.created_at)}
              </p>
            </div>
          </div>
          {isStaff ? (
            <div className="flex flex-wrap gap-2">
              {(["pinned", "locked"] as const).map((field) => (
                <form key={field} action={moderateTopic}>
                  <input type="hidden" name="course_id" value={base.course_id} />
                  <input type="hidden" name="topic_id" value={base.topic_id} />
                  <input type="hidden" name="field" value={field} />
                  <input type="hidden" name="value" value={String(!topic[field])} />
                  <Button type="submit" variant="secondary" size="sm">
                    {field === "pinned" ? <Pin size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
                    {field === "pinned"
                      ? topic.pinned
                        ? t.discussions.unpin
                        : t.discussions.pin
                      : topic.locked
                        ? t.discussions.unlock
                        : t.discussions.lock}
                  </Button>
                </form>
              ))}
              <form action={deleteTopic}>
                <input type="hidden" name="course_id" value={base.course_id} />
                <input type="hidden" name="topic_id" value={base.topic_id} />
                <Button type="submit" variant="danger" size="sm">
                  <Trash2 size={14} aria-hidden />
                  {t.discussions.deleteTopic}
                </Button>
              </form>
            </div>
          ) : null}
        </div>
        {topic.body ? <p className="prose-lite mt-5 text-[16.5px] text-slate-800">{topic.body}</p> : null}
      </Card>

      <Card className="px-5 py-2">
        <p className="py-2 text-[14px] font-bold text-slate-500">
          {replies.length === 1 ? t.discussions.oneReply : `${replies.length} ${t.discussions.replies}`}
        </p>
        <ul className="divide-y divide-slate-100">
          {roots.map((r) => (
            <ReplyItem key={r.id} r={r} depth={0} ctx={ctx} />
          ))}
        </ul>
      </Card>

      {canPost ? (
        <Card className="p-4">
          <form action={postReply} className="space-y-3">
            <input type="hidden" name="course_id" value={base.course_id} />
            <input type="hidden" name="topic_id" value={base.topic_id} />
            <Textarea name="body" required rows={4} placeholder={t.inbox.replyPlaceholder} />
            <Button type="submit">{t.discussions.reply}</Button>
          </form>
        </Card>
      ) : (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-[14.5px] text-slate-600">{t.discussions.lockedNote}</p>
      )}
    </div>
  );
}
