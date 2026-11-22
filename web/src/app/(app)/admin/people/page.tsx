import Link from "next/link";
import type { Metadata } from "next";
import { ChevronDown, ChevronLeft, ChevronRight, Link2, Search, UserMinus } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { ROLE_ORDER, canGrant, grantableRoles } from "@/lib/roles";
import type { InstitutionRole } from "@/lib/types";
import { Avatar, Badge, Button, Card, CardHeader, Empty, Flash, Input, Select } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { InviteForm } from "@/components/admin/invite-form";
import { createInvitation, revokeInvitation, revokeRole } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.staffing.title };
}

type StaffRow = {
  user_id: string;
  full_name: string;
  email: string;
  roles: Array<{ id: string; role: InstitutionRole; faculty_id: string | null; department_id: string | null }>;
  total: number;
};

const PAGE = 30;
type Invite = {
  id: string;
  role: InstitutionRole;
  faculty_id: string | null;
  department_id: string | null;
  email: string | null;
  full_name: string;
  token: string;
  expires_at: string;
  created_by: string | null;
};

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  const [{ supabase, institution, memberships: mine }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const roleFilter = typeof params.role === "string" && (ROLE_ORDER as string[]).includes(params.role) ? params.role : "";
  const page = Math.max(1, Number(params.p) || 1);

  const [{ data: rows }, { data: invites }, { data: facs }, { data: deps }, origin, { count: ownerCount }] = await Promise.all([
    supabase.rpc("admin_staff", {
      p_institution: institution.id,
      p_query: q,
      p_role: roleFilter || null,
      p_offset: (page - 1) * PAGE,
      p_limit: PAGE,
    }),
    supabase
      .from("invitations")
      .select("id, role, faculty_id, department_id, email, full_name, token, expires_at, created_by")
      .eq("institution_id", institution.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("faculties").select("id, name").eq("institution_id", institution.id).order("name"),
    supabase.from("departments").select("id, name, faculty_id").eq("institution_id", institution.id).order("name"),
    siteOrigin(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).eq("role", "owner"),
  ]);
  const faculties = (facs ?? []) as Array<{ id: string; name: string }>;
  const departments = (deps ?? []) as Array<{ id: string; name: string; faculty_id: string | null }>;
  const facultyOf = new Map(departments.map((d) => [d.id, d.faculty_id]));
  const facName = new Map(faculties.map((f) => [f.id, f.name]));
  const depName = new Map(departments.map((d) => [d.id, d.name]));
  const scopeOf = (r: { faculty_id: string | null; department_id: string | null }) =>
    r.department_id ? depName.get(r.department_id) : r.faculty_id ? facName.get(r.faculty_id) : null;

  const roles = grantableRoles(mine);
  const isAdmin = mine.some((m) => m.role === "owner" || m.role === "admin");
  // Deans and heads only see the faculties/departments they look after in the form.
  const myDepartments = isAdmin
    ? departments
    : departments.filter((d) => canGrant(mine, "teacher", null, d.id, facultyOf) || canGrant(mine, "hod", null, d.id, facultyOf));

  // One entry per person, with all their roles: searched and paged by the database.
  const list = ((rows ?? []) as StaffRow[]).map((p) => ({
    userId: p.user_id,
    name: p.full_name || p.email,
    email: p.email,
    roles: p.roles.map((r) => ({ ...r, user_id: p.user_id })),
  }));
  const total = rows?.[0] ? Number((rows[0] as StaffRow).total) : 0;
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (roleFilter) sp.set("role", roleFilter);
    if (n > 1) sp.set("p", String(n));
    const str = sp.toString();
    return (str ? `/admin/people?${str}` : "/admin/people") as "/admin/people";
  };
  // Just created: that link, until it's used or the card is closed.
  const fresh = typeof params.created === "string" ? ((invites ?? []) as Invite[]).find((v) => v.id === params.created) : undefined;

  return (
    <div className="space-y-6">
      <Flash error={errorText(t, typeof params.error === "string" ? params.error : null)} ok={params.ok ? t.common.saved : null} />

      {fresh ? (
        <Card className="border-ochre-200 bg-ochre-50/60 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-lg font-semibold">{fmt(t.staffing.linkReady, { role: t.roles[fresh.role] ?? fresh.role })}</p>
            <Link href="/admin/people" className="shrink-0 text-[14px] font-semibold text-brand-600 hover:underline">
              {t.common.done}
            </Link>
          </div>
          <p className="mb-3 text-[14px] text-slate-600">{t.staffing.linkHelp}</p>
          <ShareLink
            url={`${origin}/join/${fresh.token}`}
            labels={{ copy: t.share.copy, copied: t.share.copied }}
          />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
              <Link2 size={19} className="text-brand-600" aria-hidden />
              {t.staffing.invite}
            </h2>
            <p className="mb-4 mt-1 text-[14px] text-slate-600">{t.staffing.inviteBody}</p>
            {roles.length ? (
              <InviteForm
                action={createInvitation}
                institutionId={institution.id}
                roles={roles.map((r) => ({ value: r, label: t.roles[r], help: t.roleHelp[r] }))}
                faculties={faculties}
                departments={myDepartments}
                teacherDepartmentRequired={!isAdmin}
                labels={{
                  role: t.staffing.role,
                  faculty: t.staffing.faculty,
                  department: t.staffing.department,
                  departmentOptional: t.staffing.departmentOptional,
                  email: t.staffing.email,
                  emailHelp: t.staffing.emailHelp,
                  name: t.staffing.name,
                  submit: t.staffing.createLink,
                  noStructure: t.staffing.noStructure,
                }}
              />
            ) : (
              <p className="text-[14.5px] text-slate-600">{t.staffing.cannotInvite}</p>
            )}
          </Card>

          <Card>
            <CardHeader title={`${t.staffing.pending} (${(invites ?? []).length})`} />
            {(invites ?? []).length === 0 ? (
              <p className="px-5 py-5 text-[14.5px] text-slate-500">{t.staffing.noPending}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {((invites ?? []) as Invite[]).map((v) => (
                  <li key={v.id} className="space-y-2 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{t.roles[v.role]}</Badge>
                      {scopeOf(v) ? <span className="text-[14px] text-slate-600">{scopeOf(v)}</span> : null}
                      <span className="ml-auto text-[13px] text-slate-500">{fmt(t.staffing.expires, { date: formatDate(locale, v.expires_at) })}</span>
                    </div>
                    {v.full_name || v.email ? (
                      <p className="text-[14.5px] text-slate-800">{[v.full_name, v.email].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <ShareLink
                          url={`${origin}/join/${v.token}`}
                          labels={{ copy: t.share.copy, copied: t.share.copied }}
                        />
                      </div>
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={v.id} />
                        <button type="submit" className="h-10 px-2 text-[14px] font-semibold text-terracotta-600 hover:underline">
                          {t.staffing.cancel}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader title={`${t.staffing.members} (${total})`} />
          <form className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3" role="search">
            <div className="relative min-w-[11rem] flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={q} placeholder={t.staffList.search} aria-label={t.staffList.search} className="pl-9" />
            </div>
            <Select name="role" defaultValue={roleFilter} aria-label={t.staffing.role} className="w-auto">
              <option value="">{t.staffList.allRoles}</option>
              {ROLE_ORDER.filter((r) => r !== "student").map((r) => (
                <option key={r} value={r}>
                  {t.roles[r]}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              {t.teach.searchButton}
            </Button>
          </form>
          {list.length === 0 ? (
            <div className="p-5">
              <Empty>{q || roleFilter ? t.staffList.none : t.staffing.noPending}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((p) => {
                const sorted = [...p.roles].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
                return (
                  <li key={p.userId}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                        <Avatar name={p.name} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-slate-900">{p.name}</span>
                          <span className="block truncate text-[13px] text-slate-500">
                            {t.roles[sorted[0].role]}
                            {scopeOf(sorted[0]) ? ` · ${scopeOf(sorted[0])}` : ""}
                            {sorted.length > 1 ? ` +${sorted.length - 1}` : ""}
                          </span>
                        </span>
                        <ChevronDown size={16} aria-hidden className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="space-y-2 px-5 pb-4 pl-[4.25rem]">
                        <p className="truncate text-[13.5px] text-slate-500">{p.email}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sorted.map((r) => {
                            const removable =
                              canGrant(mine, r.role, r.faculty_id, r.department_id, facultyOf) && !(r.role === "owner" && (ownerCount ?? 0) <= 1);
                            return (
                              <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-100">
                                {t.roles[r.role]}
                                {scopeOf(r) ? <span className="font-normal text-brand-600">· {scopeOf(r)}</span> : null}
                                {removable ? (
                                  <form action={revokeRole}>
                                    <input type="hidden" name="id" value={r.id} />
                                    <button type="submit" title={t.staffing.remove} className="grid h-5 w-5 place-items-center rounded-full text-brand-500 hover:bg-terracotta-50 hover:text-terracotta-600">
                                      <UserMinus size={12} aria-hidden />
                                      <span className="sr-only">{t.staffing.remove}</span>
                                    </button>
                                  </form>
                                ) : (
                                  <span className="w-1" />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          {total > PAGE ? (
            <nav className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[14px] font-semibold">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  <ChevronLeft size={15} aria-hidden />
                  {t.adminCourses.previous}
                </Link>
              ) : (
                <span />
              )}
              <span className="font-normal text-slate-500">
                {fmt(t.adminCourses.showing, { from: (page - 1) * PAGE + 1, to: (page - 1) * PAGE + list.length, n: total })}
              </span>
              {page * PAGE < total ? (
                <Link href={pageHref(page + 1)} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  {t.adminCourses.next}
                  <ChevronRight size={15} aria-hidden />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
