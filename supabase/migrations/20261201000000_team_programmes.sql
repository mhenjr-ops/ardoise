-- Three things schools and the Ardoise team asked for:
-- 1. The Ardoise team is a team: its owner invites assistants with their own login.
-- 2. Students land in their programme and level (for official results) straight from the
--    registrar's file, so nobody registers them by hand; a courses file can carry each
--    course's department and level.
-- 3. The master dashboard counts universities, students and users.

-- 1. The Ardoise team -------------------------------------------------------------------
alter table public.platform_admins
  add column role text not null default 'member' check (role in ('owner', 'member')),
  add column invited_by uuid references public.profiles (id) on delete set null;
update public.platform_admins set role = 'owner'
where user_id = (select user_id from public.platform_admins order by created_at limit 1);

-- The first person on the team is its owner (a fresh setup needs no extra step).
create or replace function public.tg_platform_not_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from memberships where user_id = new.user_id) then
    raise exception 'platform_account';
  end if;
  if not exists (select 1 from platform_admins where role = 'owner') then
    new.role := 'owner';
  end if;
  return new;
end;
$$;

create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'owner');
$$;

create table public.platform_invitations (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  email        text check (email is null or length(email) <= 320),
  full_name    text not null default '' check (length(full_name) <= 200),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  accepted_by  uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz,
  revoked_at   timestamptz
);
alter table public.platform_invitations enable row level security;
create policy platform_invitations_select on public.platform_invitations for select to authenticated
  using (public.is_platform_admin());
grant select on public.platform_invitations to authenticated;

create or replace function public.create_team_invitation(p_email text default null, p_full_name text default '')
returns text language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if not public.is_platform_owner() then
    raise exception 'forbidden';
  end if;
  insert into platform_invitations (email, full_name, created_by)
  values (nullif(lower(trim(coalesce(p_email, ''))), ''), left(trim(coalesce(p_full_name, '')), 200), auth.uid())
  returning token into tok;
  return tok;
end;
$$;

create or replace function public.team_invitation_preview(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'full_name', v.full_name,
    'email_hint', case when v.email is null then null
                       else left(split_part(v.email, '@', 1), 2) || '•••@' || split_part(v.email, '@', 2) end,
    'status', case when v.revoked_at is not null then 'revoked'
                   when v.accepted_at is not null then 'used'
                   when v.expires_at < now() then 'expired'
                   else 'open' end)
  from platform_invitations v
  where v.token = p_token;
$$;

create or replace function public.accept_team_invitation(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record;
  me_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into v from platform_invitations where token = p_token for update;
  if v.id is null or v.revoked_at is not null then
    raise exception 'invitation_invalid';
  end if;
  if v.accepted_at is not null then
    if v.accepted_by = auth.uid() then
      return;
    end if;
    raise exception 'invitation_used';
  end if;
  if v.expires_at < now() then
    raise exception 'invitation_expired';
  end if;
  select lower(email) into me_email from profiles where id = auth.uid();
  if v.email is not null and v.email <> me_email then
    raise exception 'invitation_wrong_email';
  end if;
  -- A university account stays a university account: the team uses separate logins.
  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'school_account';
  end if;
  insert into platform_admins (user_id, role, invited_by) values (auth.uid(), 'member', v.created_by)
  on conflict (user_id) do nothing;
  update platform_invitations set accepted_by = auth.uid(), accepted_at = now() where id = v.id;
  update profiles set full_name = v.full_name where id = auth.uid() and full_name = '' and v.full_name <> '';
end;
$$;

create or replace function public.revoke_team_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'forbidden';
  end if;
  update platform_invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
end;
$$;

create or replace function public.remove_teammate(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() or p_user = auth.uid() then
    raise exception 'forbidden';
  end if;
  delete from platform_admins where user_id = p_user and role = 'member';
end;
$$;

create or replace function public.platform_team()
returns table (user_id uuid, full_name text, email text, role text, joined_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select a.user_id, p.full_name, p.email, a.role, a.created_at, u.last_sign_in_at
  from platform_admins a join profiles p on p.id = a.user_id left join auth.users u on u.id = a.user_id
  order by (a.role = 'owner') desc, a.created_at;
end;
$$;

-- 2. Programme and level from the registrar's file -------------------------------------
create or replace function public.enroll_programme(p_roster uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  prog uuid;
  yr uuid;
begin
  select * into r from student_roster where id = p_roster;
  if r.id is null or r.claimed_by is null
     or coalesce(trim(r.programme), '') = '' or coalesce(trim(r.level), '') = '' then
    return;
  end if;
  select id into prog from programmes
  where institution_id = r.institution_id
    and (lower(name) = lower(trim(r.programme)) or lower(code) = lower(trim(r.programme)))
  limit 1;
  select s.academic_year_id into yr from semesters s where s.id = public.current_semester(r.institution_id);
  if prog is null or yr is null then
    return;
  end if;
  insert into programme_enrollments (institution_id, programme_id, academic_year_id, level, student_id)
  values (r.institution_id, prog, yr, left(trim(r.level), 20), r.claimed_by)
  on conflict (programme_id, academic_year_id, student_id) do update set level = excluded.level;
end;
$$;

create or replace function public.link_student(p_roster uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  update student_roster set claimed_by = p_user, claimed_at = now(), updated_at = now()
  where id = p_roster and claimed_by is null
  returning * into r;
  if r.id is null then
    raise exception 'matricule_taken';
  end if;
  insert into memberships (institution_id, user_id, role) values (r.institution_id, p_user, 'student')
  on conflict do nothing;
  insert into enrollments (institution_id, course_id, user_id, role)
  select r.institution_id, x.course_id, p_user, 'student'
  from (select public.course_for(r.institution_id, rc.course_code, rc.semester_id) as course_id
        from roster_courses rc where rc.roster_id = r.id) x
  where x.course_id is not null
  on conflict (course_id, user_id) do nothing;
  update profiles set full_name = r.full_name where id = p_user and full_name = '' and r.full_name <> '';
  perform public.enroll_programme(r.id);
  update matricule_claims set status = 'resolved', resolved_at = now()
  where institution_id = r.institution_id and user_id = p_user and status = 'waiting';
end;
$$;
revoke execute on function public.link_student(uuid, uuid) from public, anon, authenticated;

create or replace function public.import_roster(
  p_institution uuid, p_rows jsonb, p_semester uuid default null, p_courses jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sem uuid := coalesce(p_semester, public.current_semester(p_institution));
  lang text := (select default_locale from institutions where id = p_institution);
  item jsonb;
  cx jsonb;
  r record;
  mat text;
  ccode text;
  ctitle text;
  clevel text;
  cid uuid;
  dep uuid;
  created int := 0;
  updated int := 0;
  links int := 0;
  enrolled int := 0;
  resolved int := 0;
  new_courses int := 0;
  n int;
  unknown text[] := array[]::text[];
  c record;
begin
  if not public.has_inst_role(p_institution, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000
     or jsonb_typeof(p_courses) <> 'array' or jsonb_array_length(p_courses) > 2000
     or (sem is not null and not exists (select 1 from semesters where id = sem and institution_id = p_institution)) then
    raise exception 'invalid';
  end if;

  -- Courses named in the file (code + title) that don't exist yet this semester.
  for cx in select * from jsonb_array_elements(p_courses) loop
    ccode := upper(regexp_replace(coalesce(cx ->> 'code', ''), '\s+', '', 'g'));
    ctitle := left(trim(coalesce(cx ->> 'title', '')), 200);
    clevel := nullif(left(trim(coalesce(cx ->> 'level', '')), 20), '');
    continue when length(ccode) not between 1 and 40;
    -- The department, by name or code; a faculty or school (name or code) settles same-named ones.
    dep := null;
    if nullif(trim(coalesce(cx ->> 'department', '')), '') is not null then
      select d.id into dep from departments d left join faculties f on f.id = d.faculty_id
      where d.institution_id = p_institution
        and (lower(d.name) = lower(trim(cx ->> 'department')) or lower(d.code) = lower(trim(cx ->> 'department')))
        and (nullif(trim(coalesce(cx ->> 'faculty', '')), '') is null
             or lower(f.code) = lower(trim(cx ->> 'faculty')) or lower(f.name) = lower(trim(cx ->> 'faculty')))
      limit 1;
    end if;
    select id into cid from courses where institution_id = p_institution and upper(code) = ccode
      and semester_id is not distinct from sem;
    if cid is null then
      continue when ctitle = '';
      insert into courses (institution_id, code, title, semester_id, department_id, level, language, created_by)
      values (p_institution, ccode, ctitle, sem, dep, clevel, case when lang = 'fr' then 'fr' else 'en' end, auth.uid());
      new_courses := new_courses + 1;
    else
      -- A later file can fill in what an earlier one left out.
      update courses set department_id = coalesce(department_id, dep), level = coalesce(level, clevel)
      where id = cid and ((department_id is null and dep is not null) or (level is null and clevel is not null));
    end if;
  end loop;

  for item in select * from jsonb_array_elements(p_rows) loop
    mat := upper(trim(coalesce(item ->> 'matricule', '')));
    continue when length(mat) < 2 or length(mat) > 40;
    select * into r from student_roster where institution_id = p_institution and upper(matricule) = mat;
    if r.id is null then
      insert into student_roster (institution_id, matricule, full_name, email, phone, programme, level)
      values (p_institution, mat, left(trim(coalesce(item ->> 'full_name', '')), 200),
              nullif(lower(trim(coalesce(item ->> 'email', ''))), ''), nullif(trim(coalesce(item ->> 'phone', '')), ''),
              nullif(trim(coalesce(item ->> 'programme', '')), ''), nullif(trim(coalesce(item ->> 'level', '')), ''))
      returning * into r;
      created := created + 1;
    else
      update student_roster set
        full_name = coalesce(nullif(left(trim(coalesce(item ->> 'full_name', '')), 200), ''), full_name),
        email = coalesce(nullif(lower(trim(coalesce(item ->> 'email', ''))), ''), email),
        phone = coalesce(nullif(trim(coalesce(item ->> 'phone', '')), ''), phone),
        programme = coalesce(nullif(trim(coalesce(item ->> 'programme', '')), ''), programme),
        level = coalesce(nullif(trim(coalesce(item ->> 'level', '')), ''), level),
        updated_at = now()
      where id = r.id
      returning * into r;
      updated := updated + 1;
    end if;
    if r.claimed_by is not null then
      perform public.enroll_programme(r.id);
    end if;
    if jsonb_typeof(item -> 'courses') = 'array' then
      for ccode in select upper(regexp_replace(x, '\s+', '', 'g')) from jsonb_array_elements_text(item -> 'courses') x
                   where length(regexp_replace(x, '\s+', '', 'g')) between 1 and 40 loop
        insert into roster_courses (roster_id, institution_id, course_code, semester_id) values (r.id, p_institution, ccode, sem)
        on conflict do nothing;
        get diagnostics n = row_count;
        links := links + n;
        cid := public.course_for(p_institution, ccode, sem);
        if cid is null then
          if not ccode = any (unknown) then
            unknown := unknown || ccode;
          end if;
        elsif r.claimed_by is not null then
          insert into enrollments (institution_id, course_id, user_id, role)
          values (p_institution, cid, r.claimed_by, 'student')
          on conflict (course_id, user_id) do nothing;
          get diagnostics n = row_count;
          enrolled := enrolled + n;
        end if;
      end loop;
    end if;
  end loop;

  for c in
    select mc.id, mc.user_id, s.id as roster_id
    from matricule_claims mc
    join student_roster s on s.institution_id = mc.institution_id and upper(s.matricule) = mc.matricule
    where mc.institution_id = p_institution and mc.status = 'waiting' and s.claimed_by is null
      and public.names_match(s.full_name, mc.full_name)
      and not exists (select 1 from student_roster x where x.institution_id = p_institution and x.claimed_by = mc.user_id)
  loop
    perform public.link_student(c.roster_id, c.user_id);
    resolved := resolved + 1;
  end loop;

  return jsonb_build_object('created', created, 'updated', updated, 'course_links', links,
    'enrolled', enrolled, 'claims_linked', resolved, 'unknown_courses', to_jsonb(unknown),
    'courses_created', new_courses);
end;
$$;


-- 3. The master dashboard ----------------------------------------------------------------
drop function public.platform_schools();
create or replace function public.platform_schools()
returns table (
  id uuid, name text, slug text, default_locale text, created_at timestamptz,
  students_listed int, students_joined int, staff int, users int, open_requests int
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
    (select count(*)::int from support_requests r where r.institution_id = i.id and r.handled_at is null)
  from institutions i
  order by i.name;
end;
$$;

revoke execute on function public.is_platform_owner(), public.create_team_invitation(text, text),
  public.team_invitation_preview(text), public.accept_team_invitation(text), public.revoke_team_invitation(uuid),
  public.remove_teammate(uuid), public.platform_team(), public.enroll_programme(uuid), public.platform_schools(),
  public.import_roster(uuid, jsonb, uuid, jsonb) from public, anon;
revoke execute on function public.enroll_programme(uuid) from authenticated;
grant execute on function public.team_invitation_preview(text) to anon, authenticated;
grant execute on function public.is_platform_owner(), public.create_team_invitation(text, text),
  public.accept_team_invitation(text), public.revoke_team_invitation(uuid), public.remove_teammate(uuid),
  public.platform_team(), public.platform_schools(), public.import_roster(uuid, jsonb, uuid, jsonb) to authenticated;

-- 4. Lists that stay usable with hundreds of courses and staff: searched, filtered, paged.
create or replace function public.admin_courses(
  p_institution uuid, p_query text default '', p_department uuid default null, p_offset int default 0, p_limit int default 50
) returns table (id uuid, code text, title text, department text, level text, color text, lecturers text, students int, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_inst_role(p_institution, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  return query
  with f as (
    select c.id, c.code, c.title, c.department_id, c.level, c.color
    from courses c
    where c.institution_id = p_institution
      and (p_department is null or c.department_id = p_department)
      and (coalesce(trim(p_query), '') = '' or c.code ilike '%' || trim(p_query) || '%' or c.title ilike '%' || trim(p_query) || '%')
  )
  select f.id, f.code, f.title, d.name, f.level, f.color,
    coalesce((select string_agg(p.full_name, ', ' order by p.full_name)
              from enrollments e join profiles p on p.id = e.user_id
              where e.course_id = f.id and e.role in ('teacher', 'ta')), ''),
    (select count(*)::int from enrollments e where e.course_id = f.id and e.role = 'student'),
    count(*) over ()
  from f left join departments d on d.id = f.department_id
  order by f.code
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200);
end;
$$;

create or replace function public.admin_staff(
  p_institution uuid, p_query text default '', p_role text default null, p_offset int default 0, p_limit int default 30
) returns table (user_id uuid, full_name text, email text, roles jsonb, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_inst_role(p_institution, array['admin', 'registrar', 'dean', 'hod']) then
    raise exception 'forbidden';
  end if;
  return query
  with people as (
    select m.user_id,
           jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'faculty_id', m.faculty_id, 'department_id', m.department_id)
                     order by array_position(array['owner', 'admin', 'registrar', 'dean', 'hod', 'teacher'], m.role)) as roles,
           min(array_position(array['owner', 'admin', 'registrar', 'dean', 'hod', 'teacher'], m.role)) as rank
    from memberships m
    where m.institution_id = p_institution and m.role <> 'student'
    group by m.user_id
    having p_role is null or bool_or(m.role = p_role)
  )
  select x.user_id, p.full_name, p.email, x.roles, count(*) over ()
  from people x join profiles p on p.id = x.user_id
  where coalesce(trim(p_query), '') = '' or p.full_name ilike '%' || trim(p_query) || '%' or p.email ilike '%' || trim(p_query) || '%'
  order by x.rank, p.full_name
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke execute on function public.admin_courses(uuid, text, uuid, int, int), public.admin_staff(uuid, text, text, int, int) from public, anon;
grant execute on function public.admin_courses(uuid, text, uuid, int, int), public.admin_staff(uuid, text, text, int, int) to authenticated;
