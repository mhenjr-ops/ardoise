import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Mail, MessageSquareText, Phone } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { NDOP_CHALK } from "@/lib/ndop";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, Select } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { createSchool, markRequestHandled } from "./actions";
import { markSupportDone } from "./[slug]/actions";

type Request = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  institution: string;
  job_title: string | null;
  city: string | null;
  message: string;
  created_at: string;
  handled_at: string | null;
};

type School = {
  id: string;
  name: string;
  slug: string;
  default_locale: string;
  created_at: string;
  students_listed: number;
  students_joined: number;
  staff: number;
  lecturers: number;
  courses: number;
  departments: number;
  active_week: number;
  open_requests: number;
};

/** The master dashboard: every university and its numbers, demo and change requests, new schools. */
export default async function PlatformPage({ searchParams }: PageProps<"/platform">) {
  const [{ supabase, isPlatformAdmin, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const params = await searchParams;

  const [{ data: requests }, { data: schools }, { data: links }, { data: changes }, origin] = await Promise.all([
    supabase.from("demo_requests").select("*").order("handled_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("platform_schools"),
    supabase
      .from("invitations")
      .select("id, token, institution_id")
      .eq("role", "owner")
      .eq("created_by", user.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("support_requests")
      .select("id, body, created_at, institution:institutions(name, slug), author:profiles!support_requests_created_by_fkey(full_name, email)")
      .is("handled_at", null)
      .order("created_at", { ascending: true })
      .limit(50),
    siteOrigin(),
  ]);
  type Change = {
    id: string;
    body: string;
    created_at: string;
    institution: { name: string; slug: string } | { name: string; slug: string }[] | null;
    author: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const changeList = (changes ?? []) as Change[];
  const schoolList = (schools ?? []) as School[];
  const schoolName = new Map(schoolList.map((s) => [s.id, s.name]));
  const sum = (k: keyof School) => schoolList.reduce((n, x) => n + Number(x[k] ?? 0), 0);
  const stats = [
    { label: t.master.statSchools, value: schoolList.length },
    { label: t.master.statStudents, value: sum("students_joined"), suffix: `/ ${sum("students_listed")}` },
    { label: t.master.statStaff, value: sum("staff") },
    { label: t.master.statCourses, value: sum("courses") },
    { label: t.master.statActive, value: sum("active_week") },
  ];
  const ownerLinks = ((links ?? []) as Array<{ id: string; token: string; institution_id: string }>).map((l) => ({
    ...l,
    name: schoolName.get(l.institution_id) ?? "",
  }));

  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-[24px] bg-ardoise text-chalk">
        <div aria-hidden className="absolute inset-0 opacity-80" style={{ backgroundImage: NDOP_CHALK }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ardoise via-ardoise/90 to-ardoise/40" />
        <div className="relative grid gap-7 px-6 py-7 md:px-8 md:py-9 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <p className="text-[14.5px] font-semibold text-chalk/60">{t.master.role}</p>
            <h1 className="mt-1 font-display text-[2.3rem] font-semibold leading-tight md:text-[2.8rem]">{t.master.title}</h1>
            <p className="mt-1 max-w-xl text-[16px] text-chalk/70">{t.master.intro}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-5">
            {stats.map((st) => (
              <div key={st.label}>
                <dt className="text-[13px] font-semibold text-chalk/60">{st.label}</dt>
                <dd className="num mt-0.5 font-display text-[2rem] font-semibold leading-none">
                  {st.value}
                  {st.suffix ? <span className="ml-1 text-[15px] text-chalk/50">{st.suffix}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <Flash error={errorText(t, typeof params.error === "string" ? params.error : null)} />

      <section className="mb-8">
        <h2 className="mb-4 font-display text-2xl font-semibold">{t.master.universities}</h2>
        {schoolList.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {schoolList.map((sc) => (
              <Link
                key={sc.id}
                href={`/platform/${sc.slug}`}
                className="group flex flex-col rounded-[var(--radius-card)] border border-slate-200 bg-paper p-5 transition-colors hover:border-ardoise"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-[1.2rem] font-semibold leading-snug text-slate-900">{sc.name}</p>
                    <p className="text-[13px] text-slate-500">
                      /join/{sc.slug} · {sc.default_locale.toUpperCase()} · {formatDate(locale, sc.created_at)}
                    </p>
                  </div>
                  <ArrowRight size={18} className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-ardoise" aria-hidden />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                  <div>
                    <dt className="text-[12.5px] text-slate-500">{t.master.students}</dt>
                    <dd className="num font-display text-xl font-semibold text-slate-900">
                      {sc.students_joined}
                      <span className="ml-1 text-[12.5px] font-normal text-slate-400">{fmt(t.master.onList, { n: sc.students_listed })}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] text-slate-500">{t.master.staff}</dt>
                    <dd className="num font-display text-xl font-semibold text-slate-900">{sc.staff}</dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] text-slate-500">{t.master.courses}</dt>
                    <dd className="num font-display text-xl font-semibold text-slate-900">{sc.courses}</dd>
                  </div>
                  <div>
                    <dt className="text-[12.5px] text-slate-500">{t.master.departments}</dt>
                    <dd className="num font-display text-xl font-semibold text-slate-900">{sc.departments}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[12.5px] text-slate-500">{t.master.active}</dt>
                    <dd className="num font-display text-xl font-semibold text-slate-900">{sc.active_week}</dd>
                  </div>
                </dl>
                {sc.open_requests ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-ochre-50 px-3 py-1 text-[13px] font-semibold text-ochre-700 ring-1 ring-ochre-100">
                    <MessageSquareText size={14} aria-hidden />
                    {sc.open_requests === 1 ? t.master.requestsOne : fmt(t.master.requestsMany, { n: sc.open_requests })}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <Card className="p-6">
            <Empty>{t.master.noSchools}</Empty>
          </Card>
        )}
      </section>

      {ownerLinks.length > 0 ? (
        <Card className="mb-6 border-ochre-200 bg-ochre-50/60 p-5">
          <p className="font-display text-lg font-semibold">{t.platform.ownerLinks}</p>
          <p className="mb-4 text-[14px] text-slate-600">{t.platform.ownerLinksHelp}</p>
          <ul className="space-y-4">
            {ownerLinks.map((l) => (
              <li key={l.id}>
                <p className="mb-2 text-[14px] font-semibold text-slate-800">{fmt(t.platform.ownerLink, { institution: l.name })}</p>
                <ShareLink
                  url={`${origin}/join/${l.token}`}
                  message={fmt(t.share.message, { institution: l.name, role: t.roles.owner })}
                  labels={{ copy: t.share.copy, copied: t.share.copied, whatsapp: t.share.whatsapp }}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={t.platform.requests} />
          {(requests ?? []).length === 0 ? (
            <div className="p-5">
              <Empty>{t.platform.noRequests}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {((requests ?? []) as Request[]).map((r) => (
                <li key={r.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{r.institution}</p>
                      <p className="text-[14px] text-slate-600">
                        {r.full_name}
                        {r.job_title ? ` · ${r.job_title}` : ""}
                        {r.city ? ` · ${r.city}` : ""}
                      </p>
                    </div>
                    <span className="text-[13px] text-slate-500">{formatDate(locale, r.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
                    <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                      <Mail size={14} aria-hidden />
                      {r.email}
                    </a>
                    {r.phone ? (
                      <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:underline">
                        <Phone size={14} aria-hidden />
                        {r.phone}
                      </a>
                    ) : null}
                  </div>
                  {r.message ? <p className="whitespace-pre-line text-[14.5px] text-slate-700">{r.message}</p> : null}
                  {r.handled_at ? (
                    <Badge tone="success">{t.platform.handled}</Badge>
                  ) : (
                    <form action={markRequestHandled}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        {t.platform.markHandled}
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card id="requests" className="scroll-mt-6">
            <CardHeader title={t.structure.changeRequests} />
            {changeList.length ? (
              <ul className="divide-y divide-slate-100">
                {changeList.map((c) => {
                  const school = one(c.institution);
                  const author = one(c.author);
                  return (
                    <li key={c.id} className="space-y-1.5 px-5 py-3.5">
                      <Link href={`/platform/${school?.slug ?? ""}`} className="text-[14px] font-semibold text-brand-600 hover:underline">
                        {school?.name}
                      </Link>
                      <p className="whitespace-pre-line text-[14.5px] text-slate-800">{c.body}</p>
                      <p className="text-[12.5px] text-slate-500">
                        {author?.full_name || author?.email} · {formatDate(locale, c.created_at)}
                      </p>
                      <form action={markSupportDone}>
                        <input type="hidden" name="back" value="/platform" />
                        <input type="hidden" name="slug" value={school?.slug ?? ""} />
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" size="sm" variant="secondary">
                          {t.structure.markDone}
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[14px] text-slate-500">{t.structure.noChangeRequests}</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-xl font-semibold">{t.platform.newSchool}</h2>
            <p className="mb-4 mt-1 text-[14px] text-slate-600">{t.platform.newSchoolBody}</p>
            <form action={createSchool} className="space-y-4">
              <Field label={t.platform.schoolName}>
                <Input name="name" required placeholder="University of Bamenda" />
              </Field>
              <Field label={t.platform.schoolCode} hint={t.platform.schoolCodeHelp}>
                <Input name="slug" required pattern="[a-z0-9-]{2,60}" placeholder="uba" />
              </Field>
              <Field label={t.platform.language}>
                <Select name="locale" defaultValue="en">
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </Select>
              </Field>
              <Field label={t.platform.ownerName}>
                <Input name="owner_name" />
              </Field>
              <Field label={t.platform.ownerEmail} hint={t.platform.ownerEmailHelp}>
                <Input name="owner_email" type="email" />
              </Field>
              <Button type="submit">{t.platform.create}</Button>
            </form>
          </Card>


        </div>
      </div>
    </>
  );
}
