-- Roles, oversight and joining.
--
-- 1. Schools are created by the Ardoise team only (platform admins), after a demo request.
-- 2. Seven school roles: owner, admin, registrar, dean (one faculty), hod (one department),
--    teacher, student. The owner can do everything; the other powers are split:
--      admin      people and roles below admin, structure, courses, calendar
--      registrar  registration, student list, deliberations, minutes, transcripts, grading rules
--      dean/hod   oversee the courses of their faculty/department (read), assign teachers
--      teacher    their courses (any number; a course can have several teachers)
--      student    their own work
-- 3. Staff join with an invitation link; students claim their matricule from the school's
--    student list and then sign in with it.

-- ---------------------------------------------------------------------
-- 1. Platform (the Ardoise team)
-- ---------------------------------------------------------------------
create table public.platform_admins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());
grant select on public.platform_admins to authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create table public.demo_requests (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(trim(full_name)) between 2 and 200),
  email        text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 320),
  phone        text check (phone is null or length(phone) <= 40),
  institution  text not null check (length(trim(institution)) between 2 and 200),
  job_title    text check (job_title is null or length(job_title) <= 200),
  city         text check (city is null or length(city) <= 120),
  message      text not null default '' check (length(message) <= 4000),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references public.profiles (id) on delete set null
);
alter table public.demo_requests enable row level security;
create policy demo_requests_platform on public.demo_requests for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select, update on public.demo_requests to authenticated;

create or replace function public.request_demo(
  p_full_name text, p_email text, p_phone text, p_institution text, p_job_title text, p_city text, p_message text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from demo_requests
      where lower(email) = lower(trim(p_email)) and created_at > now() - interval '1 day') >= 3
     or (select count(*) from demo_requests where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'too_many_requests';
  end if;
  insert into demo_requests (full_name, email, phone, institution, job_title, city, message)
  values (trim(p_full_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''), trim(p_institution),
          nullif(trim(coalesce(p_job_title, '')), ''), nullif(trim(coalesce(p_city, '')), ''), coalesce(trim(p_message), ''));
end;
$$;

-- Platform admins can list every school (names only); members still see their own.
drop policy institutions_select on public.institutions;
create policy institutions_select on public.institutions for select to authenticated
  using (public.is_inst_member(id) or public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 2. Roles with a scope
-- ---------------------------------------------------------------------
alter table public.memberships drop constraint memberships_role_check;
update public.memberships set role = 'owner' where role = 'admin';
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner', 'admin', 'registrar', 'dean', 'hod', 'teacher', 'student'));
alter table public.memberships
  add column faculty_id uuid references public.faculties (id) on delete cascade,
  add column department_id uuid references public.departments (id) on delete cascade;
alter table public.memberships add constraint memberships_scope_check check (
  (role = 'dean' and faculty_id is not null and department_id is null)
  or (role = 'hod' and department_id is not null and faculty_id is null)
  or (role = 'teacher' and faculty_id is null)
  or (role not in ('dean', 'hod', 'teacher') and faculty_id is null and department_id is null)
);
alter table public.memberships drop constraint memberships_institution_id_user_id_role_key;
create unique index memberships_role_scope_key on public.memberships (
  institution_id, user_id, role,
  coalesce(faculty_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create or replace function public.tg_scope_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.faculty_id is not null and not exists (
    select 1 from faculties f where f.id = new.faculty_id and f.institution_id = new.institution_id) then
    raise exception 'invalid';
  end if;
  if new.department_id is not null and not exists (
    select 1 from departments d where d.id = new.department_id and d.institution_id = new.institution_id) then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger scope_memberships before insert or update on public.memberships
  for each row execute function public.tg_scope_membership();

-- The owner passes every role check.
create or replace function public.has_inst_role(inst uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.institution_id = inst and m.user_id = auth.uid() and (m.role = any (roles) or m.role = 'owner')
  );
$$;

-- Courses belong to a department (derived from their teaching unit when not given).
alter table public.courses add column department_id uuid references public.departments (id) on delete set null;
create index courses_department_idx on public.courses (department_id);

create or replace function public.tg_course_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.department_id is null and new.teaching_unit_id is not null then
    select p.department_id into new.department_id
    from teaching_units tu join programmes p on p.id = tu.programme_id
    where tu.id = new.teaching_unit_id;
  end if;
  if new.department_id is not null and not exists (
    select 1 from departments d where d.id = new.department_id and d.institution_id = new.institution_id) then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger course_department before insert or update on public.courses
  for each row execute function public.tg_course_department();

-- Dean of the department's faculty, or its head.
create or replace function public.manages_department(dept uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select dept is not null and exists (
    select 1 from departments d
    join memberships m on m.institution_id = d.institution_id and m.user_id = auth.uid()
    where d.id = dept
      and ((m.role = 'hod' and m.department_id = d.id)
        or (m.role = 'dean' and d.faculty_id is not null and m.faculty_id = d.faculty_id)
        or m.role = 'owner')
  );
$$;

-- Read access to a course without teaching it: admin, registrar, its dean and head of department.
create or replace function public.can_oversee_course(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    where c.id = course
      and (public.has_inst_role(c.institution_id, array['admin', 'registrar'])
           or public.manages_department(c.department_id))
  );
$$;

-- Who may assign teachers and students to a course.
create or replace function public.can_staff_course(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses c
    where c.id = course
      and (public.has_inst_role(c.institution_id, array['admin', 'registrar'])
           or public.manages_department(c.department_id))
  );
$$;

-- Teaching staff: the course's teachers (and the school owner). Admins and the registrar
-- no longer edit course content or marks.
create or replace function public.is_course_staff(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.course_id = course and e.user_id = auth.uid() and e.role in ('teacher', 'ta')
  ) or exists (
    select 1 from courses c
    join memberships m on m.institution_id = c.institution_id
    where c.id = course and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Oversight: read-only access to everything in a course except answer keys, live check-in
-- codes and private messages.
do $$
declare
  t text;
begin
  foreach t in array array[
    'announcements', 'assignments', 'attendance_records', 'attendance_sessions', 'calendar_events',
    'course_files', 'discussion_replies', 'discussion_topics', 'enrollments', 'grades', 'mark_audit_log',
    'module_items', 'modules', 'pages', 'question_banks', 'questions', 'quiz_attempts', 'quizzes',
    'rubric_assessments', 'rubrics', 'submissions']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_oversee_course(course_id))',
      t || '_oversight', t);
  end loop;
end;
$$;

-- Courses
drop policy courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated
  using (
    public.is_course_member(id)
    or public.can_oversee_course(id)
    or (created_by = auth.uid() and public.is_inst_member(institution_id))
  );
drop policy courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated
  with check (public.has_inst_role(institution_id, array['admin']) or public.manages_department(department_id));
drop policy courses_update on public.courses;
create policy courses_update on public.courses for update to authenticated
  using (public.is_course_staff(id) or public.can_staff_course(id))
  with check (
    public.is_course_staff(id)
    or public.has_inst_role(institution_id, array['admin', 'registrar'])
    or public.manages_department(department_id)
  );

-- Teachers are assigned to courses explicitly; creating a course no longer enrolls its creator.
drop trigger enroll_course_creator on public.courses;
drop function public.tg_enroll_course_creator();

-- Enrollments: admins, the registrar, deans and heads assign anyone; teachers manage students.
drop policy enrollments_write on public.enrollments;
create policy enrollments_write on public.enrollments for all to authenticated
  using (public.can_staff_course(course_id) or (public.is_course_staff(course_id) and role = 'student'))
  with check (public.can_staff_course(course_id) or (public.is_course_staff(course_id) and role = 'student'));

-- Memberships: changed only through the functions below.
drop policy memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar', 'dean', 'hod']));
drop policy memberships_write on public.memberships;

-- Structure: faculties, departments, programmes and teaching units belong to the admin;
-- academic years and semesters to the admin and the registrar.
do $$
declare
  t text;
begin
  foreach t in array array['faculties', 'departments', 'programmes', 'teaching_units'] loop
    execute format('drop policy %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_inst_role(institution_id, array[''admin''])) with check (public.has_inst_role(institution_id, array[''admin'']))',
      t || '_write', t);
  end loop;
end;
$$;

-- Results belong to the registrar (and the owner); admins and deans can read them.
drop policy grading_policies_write on public.grading_policies;
create policy grading_policies_write on public.grading_policies for update to authenticated
  using (public.has_inst_role(institution_id, array['registrar']))
  with check (public.has_inst_role(institution_id, array['registrar']));
drop policy deliberations_write on public.deliberations;
create policy deliberations_write on public.deliberations for all to authenticated
  using (public.has_inst_role(institution_id, array['registrar']))
  with check (public.has_inst_role(institution_id, array['registrar']));
drop policy deliberation_results_write on public.deliberation_results;
create policy deliberation_results_write on public.deliberation_results for all to authenticated
  using (public.has_inst_role(institution_id, array['registrar']))
  with check (public.has_inst_role(institution_id, array['registrar']));
drop policy jury_adjustments_all on public.jury_adjustments;
create policy jury_adjustments_all on public.jury_adjustments for all to authenticated
  using (public.has_inst_role(institution_id, array['registrar']))
  with check (public.has_inst_role(institution_id, array['registrar']));
create policy jury_adjustments_read on public.jury_adjustments for select to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'dean']));
drop policy transcripts_insert on public.transcripts;
create policy transcripts_insert on public.transcripts for insert to authenticated
  with check (public.has_inst_role(institution_id, array['registrar']));
create policy deliberations_read on public.deliberations for select to authenticated
  using (public.has_inst_role(institution_id, array['dean']));
create policy deliberation_results_read on public.deliberation_results for select to authenticated
  using (public.has_inst_role(institution_id, array['dean']));

-- Reopening a locked deliberation: owner only.
create or replace function public.tg_scope_deliberation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
begin
  select p.institution_id into inst from programmes p where p.id = new.programme_id;
  if inst is null or not exists (select 1 from semesters s where s.id = new.semester_id and s.institution_id = inst) then
    raise exception 'invalid';
  end if;
  new.institution_id := inst;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft';
  else
    if new.programme_id is distinct from old.programme_id
       or new.semester_id is distinct from old.semester_id
       or new.level is distinct from old.level then
      raise exception 'invalid';
    end if;
    -- draft -> locked -> published; only the owner can reopen a locked deliberation.
    if old.status = 'published' and new.status <> 'published' then
      raise exception 'deliberation_published';
    end if;
    if old.status = 'draft' and new.status = 'published' then
      raise exception 'must_lock_first';
    end if;
    if old.status = 'locked' and new.status = 'draft' and not public.has_inst_role(inst, array['owner']) then
      raise exception 'forbidden';
    end if;
    if new.status = 'locked' and old.status = 'draft' then
      new.locked_at := now();
      new.locked_by := auth.uid();
    end if;
    if new.status = 'published' and old.status = 'locked' then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Who may give which role
-- ---------------------------------------------------------------------
create or replace function public.can_grant_role(inst uuid, p_role text, p_faculty uuid, p_department uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  dept_faculty uuid;
begin
  if p_role in ('owner', 'admin') then
    return public.has_inst_role(inst, array['owner']);
  elsif p_role in ('registrar', 'dean') then
    return public.has_inst_role(inst, array['admin']);
  elsif p_role = 'hod' then
    select faculty_id into dept_faculty from departments where id = p_department and institution_id = inst;
    return public.has_inst_role(inst, array['admin'])
      or exists (select 1 from memberships m where m.institution_id = inst and m.user_id = auth.uid()
                 and m.role = 'dean' and dept_faculty is not null and m.faculty_id = dept_faculty);
  elsif p_role = 'teacher' then
    return public.has_inst_role(inst, array['admin'])
      or (p_department is not null and public.manages_department(p_department));
  elsif p_role = 'student' then
    return public.has_inst_role(inst, array['admin', 'registrar']);
  end if;
  return false;
end;
$$;

create or replace function public.grant_role(p_institution uuid, p_user uuid, p_role text, p_faculty uuid default null, p_department uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not public.can_grant_role(p_institution, p_role, p_faculty, p_department) then
    raise exception 'forbidden';
  end if;
  if not public.is_inst_member(p_institution) or not exists (
    select 1 from memberships where institution_id = p_institution and user_id = p_user) then
    raise exception 'user_not_found';
  end if;
  insert into memberships (institution_id, user_id, role, faculty_id, department_id)
  values (p_institution, p_user, p_role, p_faculty, p_department)
  on conflict do nothing
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.revoke_role(p_membership uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  select * into m from memberships where id = p_membership;
  if m.id is null or not public.can_grant_role(m.institution_id, m.role, m.faculty_id, m.department_id) then
    raise exception 'forbidden';
  end if;
  if m.role = 'owner' and (select count(*) from memberships where institution_id = m.institution_id and role = 'owner') <= 1 then
    raise exception 'last_owner';
  end if;
  delete from memberships where id = p_membership;
end;
$$;

-- Old helper kept for existing screens: same rules as grant_role, found by email.
create or replace function public.add_member_by_email(p_institution uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if p_role not in ('owner', 'admin', 'registrar', 'dean', 'hod', 'teacher', 'student') then
    raise exception 'invalid_role';
  end if;
  if not public.can_grant_role(p_institution, p_role, null, null) then
    raise exception 'forbidden';
  end if;
  select p.id into target from profiles p where lower(p.email) = lower(trim(p_email));
  if target is null then
    raise exception 'user_not_found';
  end if;
  insert into memberships (institution_id, user_id, role) values (p_institution, target, p_role)
  on conflict do nothing;
  return target;
end;
$$;

create or replace function public.enroll_by_email(p_course uuid, p_email text, p_role text default 'student')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  inst uuid;
begin
  if p_role not in ('teacher', 'ta', 'student') then
    raise exception 'invalid_role';
  end if;
  if not (public.can_staff_course(p_course) or (p_role = 'student' and public.is_course_staff(p_course))) then
    raise exception 'forbidden';
  end if;
  select c.institution_id into inst from courses c where c.id = p_course;
  select p.id into target from profiles p where lower(p.email) = lower(trim(p_email));
  if target is null then
    raise exception 'user_not_found';
  end if;
  insert into memberships (institution_id, user_id, role)
  values (inst, target, case when p_role = 'student' then 'student' else 'teacher' end)
  on conflict do nothing;
  insert into enrollments (institution_id, course_id, user_id, role)
  values (inst, p_course, target, p_role)
  on conflict (course_id, user_id) do update set role = excluded.role;
  return target;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Schools are created by the platform
-- ---------------------------------------------------------------------
create or replace function public.create_institution(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  insert into institutions (name, slug) values (trim(p_name), lower(trim(p_slug)))
  returning id into new_id;
  insert into memberships (institution_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Invitations (staff): a link anyone can open, accepted once
-- ---------------------------------------------------------------------
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  role            text not null check (role in ('owner', 'admin', 'registrar', 'dean', 'hod', 'teacher')),
  faculty_id      uuid references public.faculties (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete cascade,
  email           text check (email is null or length(email) <= 320),
  full_name       text not null default '' check (length(full_name) <= 200),
  token           text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  accepted_by     uuid references public.profiles (id) on delete set null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  check (
    (role = 'dean' and faculty_id is not null and department_id is null)
    or (role = 'hod' and department_id is not null and faculty_id is null)
    or (role = 'teacher' and faculty_id is null)
    or (role not in ('dean', 'hod', 'teacher') and faculty_id is null and department_id is null)
  )
);
create index invitations_institution_idx on public.invitations (institution_id, created_at desc);
alter table public.invitations enable row level security;
create policy invitations_select on public.invitations for select to authenticated
  using (created_by = auth.uid() or public.can_grant_role(institution_id, role, faculty_id, department_id));
grant select on public.invitations to authenticated;

create or replace function public.create_invitation(
  p_institution uuid, p_role text, p_email text default null, p_full_name text default '',
  p_faculty uuid default null, p_department uuid default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if p_role = 'student' then
    raise exception 'invalid_role'; -- students join with their matricule
  end if;
  if not public.can_grant_role(p_institution, p_role, p_faculty, p_department) then
    raise exception 'forbidden';
  end if;
  if p_faculty is not null and not exists (select 1 from faculties where id = p_faculty and institution_id = p_institution)
     or p_department is not null and not exists (select 1 from departments where id = p_department and institution_id = p_institution) then
    raise exception 'invalid';
  end if;
  insert into invitations (institution_id, role, faculty_id, department_id, email, full_name, created_by)
  values (p_institution, p_role, p_faculty, p_department, nullif(lower(trim(coalesce(p_email, ''))), ''),
          trim(coalesce(p_full_name, '')), auth.uid())
  returning token into tok;
  return tok;
end;
$$;

-- What the /join page shows before anyone signs in. The token is the secret.
create or replace function public.invitation_preview(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'institution', i.name,
    'slug', i.slug,
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

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v record;
  me_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into v from invitations where token = p_token for update;
  if v.id is null or v.revoked_at is not null then
    raise exception 'invitation_invalid';
  end if;
  if v.accepted_at is not null then
    if v.accepted_by = auth.uid() then
      return v.institution_id;
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
  insert into memberships (institution_id, user_id, role, faculty_id, department_id)
  values (v.institution_id, auth.uid(), v.role, v.faculty_id, v.department_id)
  on conflict do nothing;
  update invitations set accepted_by = auth.uid(), accepted_at = now() where id = v.id;
  update profiles set full_name = v.full_name where id = auth.uid() and full_name = '' and v.full_name <> '';
  return v.institution_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  select * into v from invitations where id = p_invitation;
  if v.id is null or not (v.created_by = auth.uid()
     or public.can_grant_role(v.institution_id, v.role, v.faculty_id, v.department_id)) then
    raise exception 'forbidden';
  end if;
  update invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
end;
$$;

-- A new school with an invitation for its owner (platform admins only).
create or replace function public.create_school(
  p_name text, p_slug text, p_default_locale text default 'en', p_owner_email text default null, p_owner_name text default ''
) returns text language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
  tok text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if length(trim(p_name)) < 2 or lower(trim(p_slug)) !~ '^[a-z0-9-]{2,60}$' then
    raise exception 'invalid';
  end if;
  insert into institutions (name, slug, default_locale)
  values (trim(p_name), lower(trim(p_slug)), case when p_default_locale = 'fr' then 'fr' else 'en' end)
  returning id into inst;
  insert into invitations (institution_id, role, email, full_name, created_by)
  values (inst, 'owner', nullif(lower(trim(coalesce(p_owner_email, ''))), ''), trim(coalesce(p_owner_name, '')), auth.uid())
  returning token into tok;
  return tok;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Student list and matricules
-- ---------------------------------------------------------------------
create table public.student_roster (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  matricule       text not null check (length(trim(matricule)) between 2 and 40),
  full_name       text not null default '' check (length(full_name) <= 200),
  email           text check (email is null or length(email) <= 320),
  phone           text check (phone is null or length(phone) <= 40),
  programme       text check (programme is null or length(programme) <= 200),
  level           text check (level is null or length(level) <= 40),
  claimed_by      uuid references public.profiles (id) on delete set null,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index student_roster_matricule_key on public.student_roster (institution_id, upper(matricule));
create unique index student_roster_claimed_key on public.student_roster (institution_id, claimed_by) where claimed_by is not null;
create index student_roster_claimed_by_idx on public.student_roster (claimed_by);

create table public.roster_courses (
  roster_id       uuid not null references public.student_roster (id) on delete cascade,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_code     text not null check (length(trim(course_code)) between 1 and 40),
  primary key (roster_id, course_code)
);

create table public.matricule_claims (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  matricule       text not null,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  full_name       text not null default '',
  status          text not null check (status in ('waiting', 'disputed', 'resolved', 'rejected')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id) on delete set null
);
create unique index matricule_claims_open_key on public.matricule_claims (institution_id, user_id)
  where status in ('waiting', 'disputed');

create table public.join_attempts (
  id            bigint generated always as identity primary key,
  key           text not null,
  attempted_at  timestamptz not null default now()
);
create index join_attempts_key_idx on public.join_attempts (key, attempted_at);

alter table public.student_roster   enable row level security;
alter table public.roster_courses   enable row level security;
alter table public.matricule_claims enable row level security;
alter table public.join_attempts    enable row level security;

create policy student_roster_select on public.student_roster for select to authenticated
  using (claimed_by = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar']));
create policy student_roster_delete on public.student_roster for delete to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar']) and claimed_by is null);
create policy roster_courses_select on public.roster_courses for select to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar'])
         or exists (select 1 from student_roster s where s.id = roster_id and s.claimed_by = auth.uid()));
create policy matricule_claims_select on public.matricule_claims for select to authenticated
  using (user_id = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar']));
grant select, delete on public.student_roster to authenticated;
grant select on public.roster_courses, public.matricule_claims to authenticated;

-- Loose name check: the two names share a word of 3+ letters (accents and case ignored).
create or replace function public.names_match(a text, b text)
returns boolean language sql immutable set search_path = public as $$
  with x as (
    select array(select w from regexp_split_to_table(
             translate(lower(coalesce(a, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-z]+') w
           where length(w) >= 3) as wa,
           array(select w from regexp_split_to_table(
             translate(lower(coalesce(b, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-z]+') w
           where length(w) >= 3) as wb
  )
  select cardinality(wa) = 0 or cardinality(wb) = 0 or wa && wb from x;
$$;

-- Links a student to a roster row: membership + their registered courses.
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
  select r.institution_id, c.id, p_user, 'student'
  from roster_courses rc
  join courses c on c.institution_id = r.institution_id and upper(c.code) = upper(rc.course_code)
  where rc.roster_id = r.id
  on conflict (course_id, user_id) do nothing;
  update profiles set full_name = r.full_name where id = p_user and full_name = '' and r.full_name <> '';
  update matricule_claims set status = 'resolved', resolved_at = now()
  where institution_id = r.institution_id and user_id = p_user and status = 'waiting';
end;
$$;
revoke execute on function public.link_student(uuid, uuid) from public, anon, authenticated;

-- A signed-in student says "I am <matricule> at <school>".
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

  select id, name, slug into inst from institutions where lower(slug) = lower(trim(p_school));
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

-- "That matricule is mine": the registrar sees it among the claims to check.
create or replace function public.dispute_matricule(p_school text, p_matricule text)
returns void language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select id into inst from institutions where lower(slug) = lower(trim(p_school));
  if inst is null or not exists (
    select 1 from student_roster where institution_id = inst and upper(matricule) = upper(trim(p_matricule)) and claimed_by is not null) then
    raise exception 'invalid';
  end if;
  insert into matricule_claims (institution_id, matricule, user_id, full_name, status)
  values (inst, upper(trim(p_matricule)), auth.uid(), (select full_name from profiles where id = auth.uid()), 'disputed')
  on conflict (institution_id, user_id) where status in ('waiting', 'disputed')
  do update set matricule = excluded.matricule, status = 'disputed', created_at = now();
end;
$$;

-- Registrar decisions on a claim: link it to the matricule (moving it if needed) or reject it.
create or replace function public.resolve_claim(p_claim uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  r record;
begin
  select * into c from matricule_claims where id = p_claim and status in ('waiting', 'disputed') for update;
  if c.id is null or not public.has_inst_role(c.institution_id, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  if not p_approve then
    update matricule_claims set status = 'rejected', resolved_at = now(), resolved_by = auth.uid() where id = c.id;
    return;
  end if;
  select * into r from student_roster where institution_id = c.institution_id and upper(matricule) = c.matricule;
  if r.id is null then
    raise exception 'matricule_not_listed';
  end if;
  if r.claimed_by is not null and r.claimed_by <> c.user_id then
    -- The registrar checked IDs: take the matricule away from the other account.
    delete from enrollments e using courses co
    where e.course_id = co.id and co.institution_id = c.institution_id and e.user_id = r.claimed_by and e.role = 'student';
    delete from memberships where institution_id = c.institution_id and user_id = r.claimed_by and role = 'student';
    update student_roster set claimed_by = null, claimed_at = null where id = r.id;
  end if;
  if r.claimed_by is distinct from c.user_id then
    perform public.link_student(r.id, c.user_id);
  end if;
  update matricule_claims set status = 'resolved', resolved_at = now(), resolved_by = auth.uid() where id = c.id;
end;
$$;

-- Import (or re-import) the school's student list. Adds and updates, never deletes.
-- p_rows: [{matricule, full_name, email, phone, programme, level, courses: ["INF101", ...]}]
create or replace function public.import_roster(p_institution uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  r record;
  mat text;
  created int := 0;
  updated int := 0;
  links int := 0;
  enrolled int := 0;
  resolved int := 0;
  n int;
  ccode text;
  unknown text[] := array[]::text[];
  c record;
begin
  if not public.has_inst_role(p_institution, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'invalid';
  end if;
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
    if jsonb_typeof(item -> 'courses') = 'array' then
      for ccode in select upper(trim(x)) from jsonb_array_elements_text(item -> 'courses') x where length(trim(x)) between 1 and 40 loop
        insert into roster_courses (roster_id, institution_id, course_code) values (r.id, p_institution, ccode)
        on conflict do nothing;
        get diagnostics n = row_count;
        links := links + n;
        if not exists (select 1 from courses where institution_id = p_institution and upper(courses.code) = ccode) then
          if not ccode = any (unknown) then
            unknown := unknown || ccode;
          end if;
        elsif r.claimed_by is not null then
          insert into enrollments (institution_id, course_id, user_id, role)
          select p_institution, co.id, r.claimed_by, 'student'
          from courses co where co.institution_id = p_institution and upper(co.code) = ccode
          on conflict (course_id, user_id) do nothing;
          get diagnostics n = row_count;
          enrolled := enrolled + n;
        end if;
      end loop;
    end if;
  end loop;

  -- Students who signed up before their matricule was on the list get linked now.
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
    'enrolled', enrolled, 'claims_linked', resolved, 'unknown_courses', to_jsonb(unknown));
end;
$$;

-- New courses pick up students already registered for them on the list.
create or replace function public.tg_course_roster()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into enrollments (institution_id, course_id, user_id, role)
  select new.institution_id, new.id, s.claimed_by, 'student'
  from roster_courses rc join student_roster s on s.id = rc.roster_id
  where rc.institution_id = new.institution_id and upper(rc.course_code) = upper(new.code) and s.claimed_by is not null
  on conflict (course_id, user_id) do nothing;
  return null;
end;
$$;
create trigger course_roster after insert on public.courses
  for each row execute function public.tg_course_roster();

-- Profiles: staff see everyone in their school; students see staff, their course mates
-- and people they've talked to (no school-wide list of students' emails).
create or replace function public.can_see_profile(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select other = auth.uid()
  or exists (
    select 1 from memberships me join memberships them on them.institution_id = me.institution_id
    where me.user_id = auth.uid() and them.user_id = other
      and (me.role <> 'student' or them.role <> 'student'))
  or exists (
    select 1 from enrollments a join enrollments b on b.course_id = a.course_id
    where a.user_id = auth.uid() and b.user_id = other)
  or exists (
    select 1 from conversation_participants a join conversation_participants b on b.conversation_id = a.conversation_id
    where a.user_id = auth.uid() and b.user_id = other)
  or exists (
    select 1 from matricule_claims c
    where c.user_id = other and public.has_inst_role(c.institution_id, array['admin', 'registrar']));
$$;
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));


-- ---------------------------------------------------------------------
-- 7. Sign in with a matricule
-- ---------------------------------------------------------------------
-- Gives the account's email only to someone who already has its password, so the
-- matricule can work as a username without exposing anyone's email.
create table public.login_attempts (
  id            bigint generated always as identity primary key,
  key           text not null,
  attempted_at  timestamptz not null default now()
);
create index login_attempts_key_idx on public.login_attempts (key, attempted_at);
alter table public.login_attempts enable row level security;

create or replace function public.login_email(p_matricule text, p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := upper(trim(coalesce(p_matricule, '')));
  r record;
  found text;
begin
  if length(k) < 2 or length(k) > 40 or coalesce(p_password, '') = '' then
    return null;
  end if;
  if (select count(*) from login_attempts where key = k and attempted_at > now() - interval '15 minutes') >= 10 then
    raise exception 'too_many_attempts';
  end if;
  for r in
    select u.email, u.encrypted_password
    from student_roster s join auth.users u on u.id = s.claimed_by
    where upper(s.matricule) = k and s.claimed_by is not null
  loop
    if coalesce(r.encrypted_password, '') <> '' and extensions.crypt(p_password, r.encrypted_password) = r.encrypted_password then
      found := r.email;
      exit;
    end if;
  end loop;
  if found is null then
    insert into login_attempts (key) values (k);
    delete from login_attempts where attempted_at < now() - interval '1 day';
  end if;
  return found;
end;
$$;

-- Messaging: course mates, anyone with the school office, and staff among themselves.
create or replace function public.can_message(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_target is distinct from auth.uid() and (
    exists (
      select 1 from enrollments a join enrollments b on a.course_id = b.course_id
      where a.user_id = auth.uid() and b.user_id = p_target
    )
    or exists (
      select 1 from memberships a join memberships b on a.institution_id = b.institution_id
      where a.user_id = auth.uid() and b.user_id = p_target
        and (a.role in ('owner', 'admin', 'registrar') or b.role in ('owner', 'admin', 'registrar')
             or (a.role <> 'student' and b.role <> 'student'))
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 8. Contacts: the office now includes the owner
-- ---------------------------------------------------------------------
create or replace function public.message_contacts()
returns table (id uuid, full_name text, email text, office boolean, courses text)
language sql stable security definer set search_path = public as $$
  with my_courses as (
    select course_id from enrollments where user_id = auth.uid()
  ),
  mates as (
    select e.user_id, string_agg(distinct c.code, ', ') as courses
    from enrollments e
    join my_courses m on m.course_id = e.course_id
    join courses c on c.id = e.course_id
    where e.user_id <> auth.uid()
    group by e.user_id
  ),
  my_inst as (
    select institution_id, bool_or(role in ('owner', 'admin', 'registrar', 'dean', 'hod')) as is_office
    from memberships where user_id = auth.uid() group by institution_id
  ),
  office_people as (
    select distinct m.user_id
    from memberships m join my_inst i on i.institution_id = m.institution_id
    where m.user_id <> auth.uid() and (m.role in ('owner', 'admin', 'registrar') or (i.is_office and m.role <> 'student'))
  ),
  office_staff as (
    select distinct m.user_id
    from memberships m join my_inst i on i.institution_id = m.institution_id
    where m.role in ('owner', 'admin', 'registrar')
  )
  select p.id, p.full_name, p.email,
         exists (select 1 from office_staff o where o.user_id = p.id) as office,
         coalesce(mt.courses, '') as courses
  from profiles p
  left join mates mt on mt.user_id = p.id
  where p.id in (select user_id from mates union select user_id from office_people)
  order by 4 desc, p.full_name;
$$;

-- ---------------------------------------------------------------------
-- 9. Grants: only what each caller needs
-- ---------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'is_platform_admin', 'request_demo', 'tg_scope_membership', 'tg_course_department', 'manages_department',
      'can_oversee_course', 'can_staff_course', 'tg_scope_deliberation', 'can_see_profile', 'can_grant_role',
      'grant_role', 'revoke_role', 'create_invitation', 'invitation_preview', 'accept_invitation', 'revoke_invitation',
      'create_school', 'names_match', 'claim_matricule', 'dispute_matricule', 'resolve_claim', 'import_roster',
      'tg_course_roster', 'login_email', 'has_inst_role', 'is_course_staff', 'add_member_by_email', 'enroll_by_email',
      'create_institution', 'message_contacts', 'can_message')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;
grant execute on function public.request_demo(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.login_email(text, text) to anon, authenticated;
grant execute on function
  public.is_platform_admin(), public.manages_department(uuid), public.can_oversee_course(uuid),
  public.can_staff_course(uuid), public.can_see_profile(uuid),
  public.can_grant_role(uuid, text, uuid, uuid), public.grant_role(uuid, uuid, text, uuid, uuid),
  public.revoke_role(uuid), public.create_invitation(uuid, text, text, text, uuid, uuid),
  public.accept_invitation(text), public.revoke_invitation(uuid),
  public.create_school(text, text, text, text, text), public.names_match(text, text),
  public.claim_matricule(text, text, text), public.dispute_matricule(text, text),
  public.resolve_claim(uuid, boolean), public.import_roster(uuid, jsonb),
  public.has_inst_role(uuid, text[]), public.is_course_staff(uuid), public.add_member_by_email(uuid, text, text),
  public.enroll_by_email(uuid, text, text), public.create_institution(text, text), public.message_contacts(),
  public.can_message(uuid) to authenticated;
revoke execute on function public.tg_scope_membership(), public.tg_course_department(), public.tg_course_roster(),
  public.tg_scope_deliberation() from authenticated;
