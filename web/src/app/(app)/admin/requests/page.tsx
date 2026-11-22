import type { Metadata } from "next";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Flash, Textarea } from "@/components/ui";
import { sendRequest } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.schoolRequests.title };
}

type Request = {
  id: string;
  body: string;
  created_at: string;
  handled_at: string | null;
  author: { full_name: string } | { full_name: string }[] | null;
};

/** Everything the university asks the Ardoise team, and where each request stands. */
export default async function SchoolRequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  const [{ supabase, institution }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const { error, sent } = await searchParams;
  const { data } = await supabase
    .from("support_requests")
    .select("id, body, created_at, handled_at, author:profiles!support_requests_created_by_fkey(full_name)")
    .eq("institution_id", institution.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const requests = (data ?? []) as Request[];
  const open = requests.filter((r) => !r.handled_at);
  const done = requests.filter((r) => r.handled_at);

  const item = (r: Request) => {
    const author = Array.isArray(r.author) ? r.author[0] : r.author;
    return (
      <li key={r.id} className="space-y-1 px-5 py-4">
        <p className="whitespace-pre-line text-[15px] text-slate-800">{r.body}</p>
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
          {[author?.full_name, formatDate(locale, r.created_at)].filter(Boolean).join(", ")}
          <Badge tone={r.handled_at ? "success" : "neutral"}>{r.handled_at ? t.structure.statusDone : t.structure.statusOpen}</Badge>
        </p>
      </li>
    );
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="p-5">
        <Flash error={errorText(t, typeof error === "string" ? error : null)} ok={sent ? t.structure.requestSent : null} />
        <h2 className="font-display text-xl font-semibold">{t.structure.requestTitle}</h2>
        <p className="mb-4 mt-1 text-[14.5px] leading-relaxed text-slate-600">{t.schoolRequests.intro}</p>
        <form action={sendRequest} className="space-y-3">
          <input type="hidden" name="institution_id" value={institution.id} />
          <Textarea name="body" required minLength={3} maxLength={4000} rows={7} placeholder={t.structure.requestPlaceholder} aria-label={t.structure.requestTitle} />
          <Button type="submit">{t.structure.requestSend}</Button>
        </form>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title={`${t.structure.statusOpen} (${open.length})`} />
          {open.length ? <ul className="divide-y divide-slate-100">{open.map(item)}</ul> : <p className="px-5 py-5 text-[14.5px] text-slate-500">{t.schoolRequests.empty}</p>}
        </Card>
        {done.length ? (
          <Card>
            <CardHeader title={`${t.structure.statusDone} (${done.length})`} />
            <ul className="divide-y divide-slate-100">{done.map(item)}</ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
