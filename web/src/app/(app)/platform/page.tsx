import { notFound } from "next/navigation";
import { Building2, Mail, Phone } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { createSchool, markRequestHandled } from "./actions";

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

/** The Ardoise team's console: demo requests and new schools. */
export default async function PlatformPage({ searchParams }: PageProps<"/platform">) {
  const [{ supabase, isPlatformAdmin, user }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const params = await searchParams;

  const [{ data: requests }, { data: schools }, { data: links }, origin] = await Promise.all([
    supabase.from("demo_requests").select("*").order("handled_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }).limit(100),
    supabase.from("institutions").select("id, name, slug, default_locale, created_at").order("created_at", { ascending: false }),
    supabase
      .from("invitations")
      .select("id, token, institution_id")
      .eq("role", "owner")
      .eq("created_by", user.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    siteOrigin(),
  ]);
  const schoolName = new Map(((schools ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
  const ownerLinks = ((links ?? []) as Array<{ id: string; token: string; institution_id: string }>).map((l) => ({
    ...l,
    name: schoolName.get(l.institution_id) ?? "",
  }));

  return (
    <>
      <PageHeader title={t.platform.title} subtitle={t.platform.subtitle} />
      <Flash error={errorText(t, typeof params.error === "string" ? params.error : null)} />

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

          <Card>
            <CardHeader title={t.platform.schools} />
            <ul className="divide-y divide-slate-100">
              {((schools ?? []) as Array<{ id: string; name: string; slug: string; default_locale: string; created_at: string }>).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Building2 size={17} className="shrink-0 text-brand-500" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{s.name}</p>
                    <p className="text-[13px] text-slate-500">
                      {s.slug.toUpperCase()} · {s.default_locale.toUpperCase()} · {formatDate(locale, s.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
