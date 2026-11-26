import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, Pencil } from "lucide-react";
import { getSession } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { loadStructure, type Department, type Programme, type Unit } from "@/lib/structure";
import { StructureTree } from "@/components/structure/structure-tree";
import { SchoolMark } from "@/components/school-mark";
import { SchoolLookCard } from "@/components/school-look-card";
import { ShareLink } from "@/components/copy-button";
import { siteOrigin } from "@/lib/site";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import {
  addSemester,
  addUe,
  addYear,
  createSchoolInvite,
  importOutline,
  makeCurrent,
  markSupportDone,
  removeItem,
  setSchoolStatus,
  setStructureConfirmed,
  updateDepartment,
  updateProgramme,
  updateUnit,
  withdrawSchoolInvite,
} from "./actions";

const CYCLES = ["licence", "master", "doctorat", "hnd", "other"] as const;
const LEVELS = ["L1", "L2", "L3", "M1", "M2", "D1", "D2", "D3", "HND1", "HND2"];

type SupportRequest = { id: string; body: string; created_at: string; handled_at: string | null; author: { full_name: string; email: string } | { full_name: string; email: string }[] | null };

/** The Ardoise team's page for one school: its structure, calendar, teaching units and change requests. */
export default async function PlatformSchoolPage({ params, searchParams }: PageProps<"/platform/[slug]">) {
  const [{ supabase, isPlatformAdmin }, { t, locale }] = await Promise.all([getSession(), getI18n()]);
  if (!isPlatformAdmin) notFound();
  const { slug } = await params;
  const sp = await searchParams;
  const { data: school } = await supabase.from("institutions").select("id, name, slug, default_locale, status, structure_source, structure_confirmed_at, short_name, brand_color, logo_path, city, website")
    .eq("slug", slug).maybeSingle();
  if (!school) notFound();

  const [structure, { data: reqs }, { data: allStats }, { data: office }, { data: links }, origin] = await Promise.all([
    loadStructure(supabase, school.id),
    supabase
      .from("support_requests")
      .select("id, body, created_at, handled_at, author:profiles!support_requests_created_by_fkey(full_name, email)")
      .eq("institution_id", school.id)
      .order("handled_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.rpc("platform_schools"),
    supabase.rpc("platform_school_people", { p_institution: school.id }),
    supabase
      .from("invitations")
      .select("id, token, role, full_name, email, expires_at")
      .eq("institution_id", school.id)
      .in("role", ["owner", "admin", "registrar"])
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    siteOrigin(),
  ]);
  const openLinks = (links ?? []) as Array<{ id: string; token: string; role: string; full_name: string; email: string | null; expires_at: string }>;
  const st = ((allStats ?? []) as Array<Record<string, number | string>>).find((x) => x.id === school.id);
  const stats = st
    ? [
        { label: t.master.students, value: st.students_joined, suffix: fmt(t.master.onList, { n: st.students_listed }) },
        { label: t.master.staff, value: st.staff },
        { label: t.master.users, value: st.users },
      ]
    : [];
  const people = (office ?? []) as Array<{ role: string; full_name: string; email: string; scope: string | null; last_sign_in_at: string | null }>;
  const { units, departments, programmes, years, semesters, ues } = structure;
  const requests = (reqs ?? []) as SupportRequest[];

  const imported = typeof sp.imported === "string" ? sp.imported.split("-").map(Number) : null;
  const ok = imported
    ? fmt(t.structure.imported, { u: imported[0] ?? 0, d: imported[1] ?? 0, p: imported[2] ?? 0 })
    : sp.ok
      ? t.common.saved
      : null;
  const errorKey = typeof sp.error === "string" ? sp.error : null;
  const error = errorKey === "empty" ? t.structure.importEmpty : errorKey === "in_use" ? t.structure.inUse : errorText(t, errorKey);

  const yearLabel = (id: string) => years.find((y) => y.id === id)?.label ?? "";
  const semLabel = (id: string | null) => {
    const s = semesters.find((x) => x.id === id);
    return s ? `${s.label} · ${yearLabel(s.academic_year_id)}` : "—";
  };
  const progName = (id: string | null) => {
    const p = programmes.find((x) => x.id === id);
    return p ? p.code || p.name : "—";
  };

  const common = (
    <>
      <input type="hidden" name="slug" value={school.slug} />
      <input type="hidden" name="institution_id" value={school.id} />
    </>
  );
  const remove = (kind: string, id: string, anchor = "structure") => (
    <form action={removeItem}>
      {common}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="anchor" value={anchor} />
      <button type="submit" className="text-[13px] font-semibold text-terracotta-600 hover:underline">
        {t.structure.remove}
      </button>
    </form>
  );
  const menu = (children: ReactNode, removeForm: ReactNode) => (
    <details className="relative shrink-0 [&[open]>summary]:text-ardoise">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold text-slate-400 hover:text-ardoise [&::-webkit-details-marker]:hidden">
        <Pencil size={12} aria-hidden />
        {t.structure.edit}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-80 space-y-3 rounded-2xl border border-slate-200 bg-paper p-4 text-left shadow-lift">
        {children}
        <div className="border-t border-slate-100 pt-3">{removeForm}</div>
      </div>
    </details>
  );

  const edit = {
    unit: (u: Unit) =>
      menu(
        <form action={updateUnit} className="space-y-2.5">
          {common}
          <input type="hidden" name="id" value={u.id} />
          <Input name="name" defaultValue={u.name} required aria-label={t.common.title} />
          <div className="flex gap-2">
            <Input name="code" defaultValue={u.code ?? ""} placeholder="FS" className="w-24" aria-label="Code" />
            <Select name="kind" defaultValue={u.kind} aria-label={t.structure.kind}>
              <option value="faculty">{t.structure.kindFaculty}</option>
              <option value="school">{t.structure.kindSchool}</option>
            </Select>
          </div>
          <Button type="submit" size="sm">
            {t.common.save}
          </Button>
        </form>,
        remove("unit", u.id),
      ),
    department: (d: Department) =>
      menu(
        <form action={updateDepartment} className="space-y-2.5">
          {common}
          <input type="hidden" name="id" value={d.id} />
          <Input name="name" defaultValue={d.name} required aria-label={t.lmd.department} />
          <div className="flex gap-2">
            <Input name="code" defaultValue={d.code ?? ""} placeholder="Code" className="w-24" aria-label="Code" />
            <Select name="faculty_id" defaultValue={d.faculty_id ?? ""} aria-label={t.structure.parent}>
              <option value="">{t.structure.none}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code || u.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm">
            {t.common.save}
          </Button>
        </form>,
        remove("department", d.id),
      ),
    programme: (p: Programme) =>
      menu(
        <form action={updateProgramme} className="space-y-2.5">
          {common}
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="department_id" value={p.department_id ?? ""} />
          <Input name="name" defaultValue={p.name} required aria-label={t.lmd.programme} />
          <div className="flex gap-2">
            <Input name="code" defaultValue={p.code ?? ""} placeholder="Code" className="w-24" aria-label="Code" />
            <Select name="cycle" defaultValue={p.cycle} aria-label={t.lmd.cycle}>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {t.lmd.cycles[c]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm">
            {t.common.save}
          </Button>
        </form>,
        remove("programme", p.id),
      ),
  };

  const current = years.find((y) => y.is_current) ?? years[0];
  const isLive = school.status === "live";
  const sources = String(school.structure_source ?? "")
    .split(/\s+/)
    .filter((u) => /^https?:\/\//.test(u))
    .map((u) => {
      try {
        return { url: u, host: new URL(u).hostname.replace(/^www\./, "") };
      } catch {
        return null;
      }
    })
    .filter((x): x is { url: string; host: string } => x !== null);

  return (
    <>
      <Link href="/platform" className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={15} aria-hidden />
        {t.structure.backToConsole}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-4">
            <SchoolMark look={school} size={52} />
            <span className="min-w-0">{school.name}</span>
          </span>
        }
        subtitle={`/join/${school.slug} · ${isLive ? t.prospects.live : t.prospects.prospect}`}
      />
      <Flash error={error} ok={ok} />
      {stats.length ? (
        <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-3xl">
          {stats.map((x) => (
            <div key={x.label} className="rounded-2xl border border-slate-200 bg-paper px-4 py-3">
              <dt className="text-[12.5px] font-semibold text-slate-500">{x.label}</dt>
              <dd className="num font-display text-[1.7rem] font-semibold leading-tight text-slate-900">
                {x.value}
                {"suffix" in x && x.suffix ? <span className="ml-1 text-[12.5px] font-normal text-slate-400">{x.suffix}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div id="structure" className="min-w-0 scroll-mt-6">
          {units.length || departments.length ? (
            <StructureTree structure={structure} t={t} edit={edit} />
          ) : (
            <Card className="p-6">
              <Empty>{t.structure.noDepartments}</Empty>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card id="status" className="scroll-mt-6">
            <CardHeader
              title={t.prospects.status}
              action={<Badge tone={isLive ? "success" : "neutral"}>{isLive ? t.prospects.live : t.prospects.prospect}</Badge>}
            />
            <div className="space-y-4 px-5 py-4">
              <p className="text-[14px] text-slate-600">{isLive ? t.prospects.liveHelp : t.prospects.prospectHelp}</p>
              <form action={setSchoolStatus}>
                {common}
                <input type="hidden" name="status" value={isLive ? "prospect" : "live"} />
                <Button type="submit" size="sm" variant={isLive ? "secondary" : "primary"}>
                  {isLive ? t.prospects.close : t.prospects.open}
                </Button>
              </form>
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-1 flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-slate-900">
                  {t.prospects.structure}
                  {school.structure_confirmed_at ? (
                    <Badge tone="success">
                      {fmt(t.prospects.confirmedOn, { date: formatDate(locale, school.structure_confirmed_at) })}
                    </Badge>
                  ) : (
                    <Badge tone="warn">{t.prospects.unconfirmed}</Badge>
                  )}
                </p>
                {school.structure_confirmed_at ? null : (
                  <p className="text-[14px] text-slate-600">{t.prospects.unconfirmedHelp}</p>
                )}
                {sources.length ? (
                  <p className="mt-2 text-[13px] text-slate-500">
                    {t.prospects.sources}:{" "}
                    {sources.map((x, i) => (
                      <span key={x.url}>
                        {i ? ", " : ""}
                        <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">
                          {x.host}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                <form action={setStructureConfirmed} className="mt-3">
                  {common}
                  <input type="hidden" name="confirmed" value={school.structure_confirmed_at ? "0" : "1"} />
                  <Button type="submit" size="sm" variant="secondary">
                    {school.structure_confirmed_at ? t.prospects.unconfirm : t.prospects.confirm}
                  </Button>
                </form>
              </div>
            </div>
          </Card>

          <Card id="invite" className="scroll-mt-6">
            <CardHeader title={t.platformInvite.title} />
            <div className="space-y-4 px-5 py-4">
              <p className="text-[14px] text-slate-600">{t.platformInvite.intro}</p>
              <form action={createSchoolInvite} className="space-y-3">
                {common}
                <Field label={t.platformInvite.role}>
                  <Select name="role" defaultValue="registrar">
                    <option value="registrar">{t.roles.registrar}</option>
                    <option value="owner">{t.roles.owner}</option>
                    <option value="admin">{t.roles.admin}</option>
                  </Select>
                </Field>
                <Field label={t.platformInvite.name}>
                  <Input name="full_name" maxLength={200} />
                </Field>
                <Field label={t.platformInvite.email} hint={t.platform.ownerEmailHelp}>
                  <Input name="email" type="email" maxLength={320} />
                </Field>
                <Button type="submit" size="sm">
                  {t.platformInvite.make}
                </Button>
              </form>
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-[14.5px] font-semibold text-slate-900">{t.platformInvite.waiting}</p>
                {openLinks.length ? (
                  <ul className="space-y-4">
                    {openLinks.map((l) => (
                      <li key={l.id} className="space-y-2">
                        <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-slate-700">
                          <Badge tone={l.role === "owner" ? "brand" : "neutral"}>{t.roles[l.role as keyof typeof t.roles] ?? l.role}</Badge>
                          {l.full_name || l.email || ""}
                          <span className="text-slate-400">{fmt(t.platformInvite.expires, { date: formatDate(locale, l.expires_at) })}</span>
                        </p>
                        <ShareLink url={`${origin}/join/${l.token}`} labels={{ copy: t.share.copy, copied: t.share.copied }} />
                        <form action={withdrawSchoolInvite}>
                          {common}
                          <input type="hidden" name="id" value={l.id} />
                          <button type="submit" className="text-[13px] font-semibold text-terracotta-600 hover:underline">
                            {t.platformInvite.withdraw}
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13.5px] text-slate-500">{t.platformInvite.none}</p>
                )}
              </div>
            </div>
          </Card>

          <SchoolLookCard school={school} back={`/platform/${school.slug}`} t={t} />

          <Card>
            <CardHeader title={t.master.office} />
            {people.length ? (
              <ul className="divide-y divide-slate-100">
                {people.map((p, i) => (
                  <li key={`${p.email}-${p.role}-${i}`} className="px-5 py-3">
                    <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-slate-900">
                      {p.full_name || p.email}
                      <Badge tone={p.role === "owner" ? "brand" : "neutral"}>{t.roles[p.role as keyof typeof t.roles] ?? p.role}</Badge>
                    </p>
                    <p className="text-[13px] text-slate-500">
                      <a href={`mailto:${p.email}`} className="hover:underline">
                        {p.email}
                      </a>
                      {p.scope ? ` · ${p.scope}` : ""} ·{" "}
                      {p.last_sign_in_at ? fmt(t.master.lastSeen, { date: formatDate(locale, p.last_sign_in_at) }) : t.master.never}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[14px] text-slate-500">{t.master.noOffice}</p>
            )}
          </Card>

          <Card id="requests" className="scroll-mt-6">
            <CardHeader title={t.structure.changeRequests} />
            {requests.length ? (
              <ul className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const a = Array.isArray(r.author) ? r.author[0] : r.author;
                  return (
                    <li key={r.id} className="space-y-1.5 px-5 py-3.5">
                      <p className="whitespace-pre-line text-[14.5px] text-slate-800">{r.body}</p>
                      <p className="text-[12.5px] text-slate-500">
                        {a?.full_name || a?.email} · {formatDate(locale, r.created_at)}
                      </p>
                      {r.handled_at ? (
                        <Badge tone="success">{t.structure.statusDone}</Badge>
                      ) : (
                        <form action={markSupportDone}>
                          {common}
                          <input type="hidden" name="id" value={r.id} />
                          <Button type="submit" size="sm" variant="secondary">
                            {t.structure.markDone}
                          </Button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-[14px] text-slate-500">{t.structure.noChangeRequests}</p>
            )}
          </Card>

          <Card id="import" className="scroll-mt-6 p-5">
            <h2 className="font-display text-xl font-semibold">{t.structure.importTitle}</h2>
            <p className="mb-3 mt-1 text-[13.5px] leading-relaxed text-slate-600">{t.structure.importHelp}</p>
            <form action={importOutline} className="space-y-3">
              {common}
              <Textarea
                name="outline"
                required
                rows={10}
                className="font-mono text-[13px]"
                placeholder={"# Faculty of Science (FS)\n- Physics\n- Mathematics and Computer Science\n-- Pure Mathematics\n## Higher Institute of Transport and Logistics (HITL)\n- Customs"}
              />
              <Button type="submit">{t.structure.importButton}</Button>
            </form>
          </Card>

        </div>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <Card id="calendar" className="scroll-mt-6">
          <CardHeader title={t.lmd.years} />
          <div className="space-y-4 px-5 py-4">
            {years.length ? (
              <ul className="space-y-3">
                {years.map((y) => (
                  <li key={y.id} className="rounded-xl bg-sand/60 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{y.label}</span>
                      {y.is_current ? <Badge tone="brand">{t.structure.current}</Badge> : null}
                      {y.starts_on && y.ends_on ? (
                        <span className="text-[13px] text-slate-500">
                          {formatDate(locale, y.starts_on)} – {formatDate(locale, y.ends_on)}
                        </span>
                      ) : null}
                      <span className="ml-auto flex items-center gap-3">
                        {!y.is_current ? (
                          <form action={makeCurrent}>
                            {common}
                            <input type="hidden" name="id" value={y.id} />
                            <button type="submit" className="text-[13px] font-semibold text-brand-600 hover:underline">
                              {t.structure.makeCurrent}
                            </button>
                          </form>
                        ) : null}
                        {remove("year", y.id, "calendar")}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {semesters
                        .filter((s) => s.academic_year_id === y.id)
                        .map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-2 text-[14px] text-slate-700">
                            <span>
                              {s.label}
                              {s.starts_on && s.ends_on ? (
                                <span className="ml-2 text-[12.5px] text-slate-500">
                                  {formatDate(locale, s.starts_on)} – {formatDate(locale, s.ends_on)}
                                </span>
                              ) : null}
                            </span>
                            {remove("semester", s.id, "calendar")}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t.structure.noYear}</Empty>
            )}

            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-[14px] font-semibold text-slate-800">{t.structure.addYear}</summary>
              <form action={addYear} className="mt-3 grid gap-3 sm:grid-cols-2">
                {common}
                <input type="hidden" name="locale" value={school.default_locale} />
                <Field label={t.lmd.year}>
                  <Input name="label" required placeholder="2027-2028" />
                </Field>
                <div />
                <Field label={t.lmd.startsOn}>
                  <Input name="starts_on" type="date" />
                </Field>
                <Field label={t.lmd.endsOn}>
                  <Input name="ends_on" type="date" />
                </Field>
                <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
                  <input type="checkbox" name="with_semesters" defaultChecked className="h-4 w-4 accent-brand-600" />
                  {t.structure.withSemesters}
                </label>
                <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
                  <input type="checkbox" name="is_current" className="h-4 w-4 accent-brand-600" />
                  {t.lmd.current}
                </label>
                <Button type="submit" size="sm" className="justify-self-start">
                  {t.common.add}
                </Button>
              </form>
            </details>

            {current ? (
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-[14px] font-semibold text-slate-800">{t.structure.addSemester}</summary>
                <form action={addSemester} className="mt-3 grid gap-3 sm:grid-cols-2">
                  {common}
                  <Field label={t.lmd.year}>
                    <Select name="academic_year_id" defaultValue={current.id}>
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t.lmd.semester}>
                    <Input name="label" required placeholder="Resit session" />
                  </Field>
                  <Field label={t.lmd.startsOn}>
                    <Input name="starts_on" type="date" />
                  </Field>
                  <Field label={t.lmd.endsOn}>
                    <Input name="ends_on" type="date" />
                  </Field>
                  <Button type="submit" size="sm" className="justify-self-start">
                    {t.common.add}
                  </Button>
                </form>
              </details>
            ) : null}
          </div>
        </Card>

        <details id="ues" className="group scroll-mt-6 rounded-[var(--radius-card)] border border-slate-200 bg-paper" open={ues.length > 0}>
          <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-semibold text-slate-900">
                {t.master.ueTitle}
                {ues.length ? <span className="ml-2 text-[14px] font-normal text-slate-500">({ues.length})</span> : null}
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-relaxed text-slate-500">{t.master.ueHelp}</span>
            </span>
            <ChevronDown size={18} aria-hidden className="mt-1 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-slate-100 px-5 py-4">
            {ues.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[12.5px] text-slate-500">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">{t.common.title}</th>
                      <th className="py-2 pr-3">{t.lmd.credits}</th>
                      <th className="py-2 pr-3">{t.lmd.programme}</th>
                      <th className="py-2 pr-3">{t.lmd.semester}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ues.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-semibold">{u.code}</td>
                        <td className="py-2 pr-3">{u.title}</td>
                        <td className="num py-2 pr-3">{u.credits}</td>
                        <td className="py-2 pr-3">
                          {progName(u.programme_id)} {u.level ? <span className="text-slate-400">{u.level}</span> : null}
                        </td>
                        <td className="py-2 pr-3">{semLabel(u.semester_id)}</td>
                        <td className="py-2 text-right">{remove("ue", u.id, "ues")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-[14px] font-semibold text-slate-800">{t.structure.addUe}</summary>
              <form action={addUe} className="mt-3 grid gap-3 sm:grid-cols-2">
                {common}
                <Input name="code" required placeholder="CSC101" aria-label="Code" />
                <Input name="credits" type="number" min="0" max="60" required placeholder={t.lmd.credits} aria-label={t.lmd.credits} />
                <Input name="title" required placeholder="Introduction to Programming" className="sm:col-span-2" aria-label={t.common.title} />
                <Select name="programme_id" required aria-label={t.lmd.programme} defaultValue="">
                  <option value="" disabled>
                    {t.lmd.programme}…
                  </option>
                  {programmes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ` : ""}
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Input name="level" list="levels" placeholder={t.lmd.level} aria-label={t.lmd.level} />
                <datalist id="levels">
                  {LEVELS.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                <Select name="semester_id" required aria-label={t.lmd.semester} className="sm:col-span-2" defaultValue="">
                  <option value="" disabled>
                    {t.lmd.semester}…
                  </option>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {semLabel(s.id)}
                    </option>
                  ))}
                </Select>
                <Button type="submit" size="sm" className="justify-self-start" disabled={!programmes.length || !semesters.length}>
                  {t.common.add}
                </Button>
              </form>
            </details>
          </div>
        </details>
      </div>
    </>
  );
}
