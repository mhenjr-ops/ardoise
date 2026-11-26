-- Universities we prepare before they sign ("prospects").
-- A prospect is visible to the Ardoise team only: it is not in the sign-up list, students
-- cannot join it with a matricule, and it doesn't count among the universities on the
-- master dashboard. Staff invitation links still work, so its registrar can be let in to
-- check the structure before it opens. One switch makes it live.
-- Its structure can be marked unconfirmed (taken from its website) until the university
-- checks it.

alter table public.institutions
  add column status text not null default 'live' check (status in ('live', 'prospect')),
  add column structure_source text not null default '' check (length(structure_source) <= 500),
  add column structure_confirmed_at timestamptz;
update public.institutions set structure_confirmed_at = created_at;

-- A university's own administrators can edit its name and settings, but not whether it is
-- open or whether its structure is confirmed: only the Ardoise team decides those.
create or replace function public.tg_institution_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin()
     and (new.status is distinct from old.status
          or new.structure_confirmed_at is distinct from old.structure_confirmed_at
          or new.structure_source is distinct from old.structure_source) then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;
create trigger institution_status_guard before update on public.institutions
  for each row execute function public.tg_institution_status_guard();

-- The sign-up list: live universities only.
create or replace function public.school_directory()
returns table (slug text, name text)
language sql stable security definer set search_path = public as $$
  select i.slug, i.name from institutions i where i.status = 'live' order by i.name;
$$;

-- Students join live universities only (a prospect answers like an unknown university).
create or replace function public.claim_matricule(p_school text, p_matricule text, p_full_name text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inst record;
  r record;
  me uuid := auth.uid();
  name_given text;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if (select count(*) from join_attempts where key = 'claim:' || me::text and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;
  insert into join_attempts (key) values ('claim:' || me::text);

  select id, name, slug into inst from institutions where lower(slug) = lower(trim(p_school)) and status = 'live';
  if inst.id is null then
    return jsonb_build_object('status', 'school_not_found');
  end if;
  if exists (select 1 from student_roster where institution_id = inst.id and claimed_by = me) then
    return jsonb_build_object('status', 'linked', 'institution', inst.name);
  end if;
  name_given := coalesce(nullif(trim(p_full_name), ''), (select full_name from profiles where id = me));

  select * into r from student_roster
  where institution_id = inst.id and upper(matricule) = upper(trim(p_matricule));
  if r.id is null then
    insert into matricule_claims (institution_id, matricule, user_id, full_name, status)
    values (inst.id, upper(trim(p_matricule)), me, coalesce(name_given, ''), 'waiting')
    on conflict (institution_id, user_id) where status in ('waiting', 'disputed')
    do update set matricule = excluded.matricule, full_name = excluded.full_name, created_at = now();
    return jsonb_build_object('status', 'waiting', 'institution', inst.name);
  end if;
  if r.claimed_by is not null then
    return jsonb_build_object('status', 'taken', 'institution', inst.name);
  end if;
  if not public.names_match(r.full_name, name_given) then
    return jsonb_build_object('status', 'name_mismatch', 'institution', inst.name);
  end if;
  perform public.link_student(r.id, me);
  return jsonb_build_object('status', 'linked', 'institution', inst.name);
end;
$$;

-- New universities from the console start as prospects unless said otherwise.
drop function public.create_school(text, text, text, text, text);
create or replace function public.create_school(
  p_name text, p_slug text, p_default_locale text default 'en', p_owner_email text default null, p_owner_name text default '',
  p_status text default 'prospect'
) returns text language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
  tok text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if length(trim(p_name)) < 2 or lower(trim(p_slug)) !~ '^[a-z0-9-]{2,60}$' or p_status not in ('live', 'prospect') then
    raise exception 'invalid';
  end if;
  insert into institutions (name, slug, default_locale, status)
  values (trim(p_name), lower(trim(p_slug)), case when p_default_locale = 'fr' then 'fr' else 'en' end, p_status)
  returning id into inst;
  insert into invitations (institution_id, role, email, full_name, created_by)
  values (inst, 'owner', nullif(lower(trim(coalesce(p_owner_email, ''))), ''), trim(coalesce(p_owner_name, '')), auth.uid())
  returning token into tok;
  return tok;
end;
$$;

-- The Ardoise team opens a university (or takes it back to prospect).
create or replace function public.set_institution_status(p_institution uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_status not in ('live', 'prospect') then
    raise exception 'invalid';
  end if;
  update institutions set status = p_status where id = p_institution;
end;
$$;

-- The structure has been checked with the university (or not yet).
create or replace function public.set_structure_confirmed(p_institution uuid, p_confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  update institutions set structure_confirmed_at = case when p_confirmed then now() end where id = p_institution;
end;
$$;

-- The master dashboard: live and prospect universities, with the size of their structure.
drop function public.platform_schools();
create or replace function public.platform_schools()
returns table (
  id uuid, name text, slug text, default_locale text, created_at timestamptz,
  students_listed int, students_joined int, staff int, users int, open_requests int,
  status text, structure_confirmed_at timestamptz, structure_source text, faculties int, departments int
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
    (select count(*)::int from departments d where d.institution_id = i.id)
  from institutions i
  order by i.name;
end;
$$;

revoke execute on function public.tg_institution_status_guard() from public, anon, authenticated;
revoke execute on function public.create_school(text, text, text, text, text, text), public.set_institution_status(uuid, text),
  public.set_structure_confirmed(uuid, boolean), public.platform_schools() from public, anon;
grant execute on function public.create_school(text, text, text, text, text, text), public.set_institution_status(uuid, text),
  public.set_structure_confirmed(uuid, boolean), public.platform_schools() to authenticated;
