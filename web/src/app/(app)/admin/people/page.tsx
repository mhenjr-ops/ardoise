import type { Metadata } from "next";
import { Link2, UserMinus } from "lucide-react";
import { requireInstitution } from "@/lib/session";
import { errorText, getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/messages-engage";
import { formatDate } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { ROLE_ORDER, canGrant, grantableRoles } from "@/lib/roles";
import type { InstitutionRole } from "@/lib/types";
import { Avatar, Badge, Card, CardHeader, Empty, Flash } from "@/components/ui";
import { ShareLink } from "@/components/copy-button";
import { InviteForm } from "@/components/admin/invite-form";
import { createInvitation, revokeInvitation, revokeRole } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.staffing.title };
}

type Row = {
  id: string;
  user_id: string;
  role: InstitutionRole;
  faculty_id: string | null;
  department_id: string | null;
  profile: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
};
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
  const [{ supabase, institution, memberships: mine, user }, { t, locale }] = await Promise.all([requireInstitution(), getI18n()]);
  const params = await searchParams;

  const [{ data: rows }, { data: invites }, { data: facs }, { data: deps }, origin] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, role, faculty_id, department_id, profile:profiles(full_name, email)")
      .eq("institution_id", institution.id)
      .neq("role", "student"),
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

  // One entry per person, with all their roles.
  const people = new Map<string, { name: string; email: string; roles: Row[] }>();
  for (const r of (rows ?? []) as Row[]) {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    const entry = people.get(r.user_id) ?? { name: p?.full_name || p?.email || "", email: p?.email ?? "", roles: [] };
    entry.roles.push(r);
    people.set(r.user_id, entry);
  }
  const rank = (e: { roles: Row[] }) => Math.min(...e.roles.map((r) => ROLE_ORDER.indexOf(r.role)));
  const list = [...people.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, locale));
  // Just created: the newest open link this user made.
  const fresh = params.created ? ((invites ?? []) as Invite[]).find((v) => v.created_by === user.id) : undefined;
  const ownerCount = ((rows ?? []) as Row[]).filter((r) => r.role === "owner").length;

  return (
    <div className="space-y-6">
      <Flash error={errorText(t, typeof params.error === "string" ? params.error : null)} ok={params.ok ? t.common.saved : null} />

      {fresh ? (
        <Card className="border-ochre-200 bg-ochre-50/60 p-5">
          <p className="font-display text-lg font-semibold">{fmt(t.staffing.linkReady, { role: t.roles[fresh.role] ?? fresh.role })}</p>
          <p className="mb-3 text-[14px] text-slate-600">{t.staffing.linkHelp}</p>
          <ShareLink
            url={`${origin}/join/${fresh.token}`}
            message={fmt(t.share.message, { institution: institution.name, role: t.roles[fresh.role] ?? fresh.role })}
            labels={{ copy: t.share.copy, copied: t.share.copied, whatsapp: t.share.whatsapp }}
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
                          message={fmt(t.share.message, { institution: institution.name, role: t.roles[v.role] })}
                          labels={{ copy: t.share.copy, copied: t.share.copied, whatsapp: t.share.whatsapp }}
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

        <Card>
          <CardHeader title={`${t.staffing.members} (${list.length})`} />
          {list.length === 0 ? (
            <div className="p-5">
              <Empty>{t.staffing.noPending}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((p) => (
                <li key={p.roles[0].user_id} className="flex items-start gap-3 px-5 py-3.5">
                  <Avatar name={p.name || p.email} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-900">{p.name}</p>
                    <p className="truncate text-[13.5px] text-slate-500">{p.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.roles
                        .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
                        .map((r) => {
                          const removable =
                            canGrant(mine, r.role, r.faculty_id, r.department_id, facultyOf) && !(r.role === "owner" && ownerCount <= 1);
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
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
