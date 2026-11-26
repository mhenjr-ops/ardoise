-- Each university's look (logo, colour, short name, city, website), and the links the Ardoise
-- team sends to a university's people (its head or its registrar), for any university.

alter table public.institutions
  add column short_name text not null default '' check (length(short_name) <= 12),
  add column brand_color text not null default '' check (brand_color = '' or brand_color ~ '^#[0-9a-f]{6}$'),
  add column logo_path text not null default '' check (length(logo_path) <= 300),
  add column city text not null default '' check (length(city) <= 80),
  add column website text not null default '' check (website = '' or (length(website) <= 300 and website ~ '^https?://'));

-- Who may change a university's look: the Ardoise team, or the university's head and administrators.
create or replace function public.can_edit_school_look(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.has_inst_role(inst, array['admin']);
$$;

create or replace function public.set_school_profile(
  p_institution uuid, p_short_name text, p_brand_color text, p_city text, p_website text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_school_look(p_institution) then
    raise exception 'forbidden';
  end if;
  update institutions set
    short_name = trim(coalesce(p_short_name, '')),
    brand_color = lower(trim(coalesce(p_brand_color, ''))),
    city = trim(coalesce(p_city, '')),
    website = trim(coalesce(p_website, ''))
  where id = p_institution;
end;
$$;

-- The logo is a file in the public "brand" bucket, under the university's own folder.
create or replace function public.set_school_logo(p_institution uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_school_look(p_institution) then
    raise exception 'forbidden';
  end if;
  if coalesce(p_path, '') <> '' and split_part(p_path, '/', 1) <> p_institution::text then
    raise exception 'invalid';
  end if;
  update institutions set logo_path = coalesce(p_path, '') where id = p_institution;
end;
$$;

insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do nothing;
-- On the real platform: small images only (the local test stand-in has no such columns).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] where id = 'brand'$q$;
  end if;
end;
$$;

create policy brand_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and public.can_edit_school_look(public.path_uuid((storage.foldername(name))[1])));
create policy brand_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'brand' and public.can_edit_school_look(public.path_uuid((storage.foldername(name))[1])));
create policy brand_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand' and public.can_edit_school_look(public.path_uuid((storage.foldername(name))[1])));

-- A link for a university's head (owner), administrator or registrar, from the Ardoise team.
create or replace function public.platform_invite(
  p_institution uuid, p_role text, p_email text default null, p_full_name text default ''
) returns text language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_role not in ('owner', 'admin', 'registrar') or not exists (select 1 from institutions where id = p_institution) then
    raise exception 'invalid';
  end if;
  insert into invitations (institution_id, role, email, full_name, created_by)
  values (p_institution, p_role, nullif(lower(trim(coalesce(p_email, ''))), ''), trim(coalesce(p_full_name, '')), auth.uid())
  returning token into tok;
  return tok;
end;
$$;

-- The whole Ardoise team sees and can withdraw the links sent to universities.
drop policy invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (created_by = auth.uid() or public.is_platform_admin()
         or public.can_grant_role(institution_id, role, faculty_id, department_id));

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  select * into v from invitations where id = p_invitation;
  if v.id is null or not (v.created_by = auth.uid() or public.is_platform_admin()
     or public.can_grant_role(v.institution_id, v.role, v.faculty_id, v.department_id)) then
    raise exception 'forbidden';
  end if;
  update invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
end;
$$;

-- The join page shows the university's look.
create or replace function public.invitation_preview(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'institution', i.name,
    'slug', i.slug,
    'short_name', i.short_name,
    'brand_color', i.brand_color,
    'logo_path', i.logo_path,
    'role', v.role,
    'faculty', f.name,
    'department', d.name,
    'full_name', v.full_name,
    'email_hint', case when v.email is null then null
                       else left(split_part(v.email, '@', 1), 2) || '•••@' || split_part(v.email, '@', 2) end,
    'status', case when v.revoked_at is not null then 'revoked'
                   when v.accepted_at is not null then 'used'
                   when v.expires_at < now() then 'expired'
                   else 'open' end)
  from invitations v
  join institutions i on i.id = v.institution_id
  left join faculties f on f.id = v.faculty_id
  left join departments d on d.id = v.department_id
  where v.token = p_token;
$$;

-- The master dashboard carries each university's look.
drop function public.platform_schools();
create or replace function public.platform_schools()
returns table (
  id uuid, name text, slug text, default_locale text, created_at timestamptz,
  students_listed int, students_joined int, staff int, users int, open_requests int,
  status text, structure_confirmed_at timestamptz, structure_source text, faculties int, departments int,
  short_name text, brand_color text, logo_path text, city text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select i.id, i.name, i.slug, i.default_locale, i.created_at,
    (select count(*)::int from student_roster s where s.institution_id = i.id),
    (select count(distinct m.user_id)::int from memberships m where m.institution_id = i.id and m.role = 'student'),
    (select count(distinct m.user_id)::int from memberships m where m.institution_id = i.id and m.role <> 'student'),
    (select count(distinct m.user_id)::int from memberships m where m.institution_id = i.id),
    (select count(*)::int from support_requests r where r.institution_id = i.id and r.handled_at is null),
    i.status, i.structure_confirmed_at, i.structure_source,
    (select count(*)::int from faculties f where f.institution_id = i.id),
    (select count(*)::int from departments d where d.institution_id = i.id),
    i.short_name, i.brand_color, i.logo_path, i.city
  from institutions i
  order by i.name;
end;
$$;

-- Short names the universities are known by.
update public.institutions s set short_name = v.short
from (values ('uba', 'UBa'), ('ub', 'UB'), ('buib', 'BUIB'), ('cuib', 'CUIB'), ('iuc', 'IUC'), ('iug', 'IUG'),
             ('ucac', 'UCAC'), ('upac', 'UPAC'), ('npui', 'NPUI'), ('catuc', 'CATUC'), ('buist', 'BUIST'), ('iub', 'IUB'))
  as v(slug, short)
where s.slug = v.slug and s.short_name = '';

revoke execute on function public.can_edit_school_look(uuid), public.set_school_profile(uuid, text, text, text, text),
  public.set_school_logo(uuid, text), public.platform_invite(uuid, text, text, text), public.revoke_invitation(uuid),
  public.platform_schools() from public, anon;
grant execute on function public.can_edit_school_look(uuid), public.set_school_profile(uuid, text, text, text, text),
  public.set_school_logo(uuid, text), public.platform_invite(uuid, text, text, text), public.revoke_invitation(uuid),
  public.platform_schools() to authenticated;
