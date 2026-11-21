-- =====================================================================
-- Ardoise LMS — sprint 1 schema
-- Multi-tenant: every row carries institution_id; row-level security
-- (RLS) keeps each school's data walled off from every other school.
-- Run with:  supabase db push   (or paste into the Supabase SQL editor)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tenancy and people
-- ---------------------------------------------------------------------
create table public.institutions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 1),
  slug             text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  country          text not null default 'CM',
  default_locale   text not null default 'fr' check (default_locale in ('fr', 'en')),
  grading_system   text not null default 'lmd20' check (grading_system in ('lmd20', 'gpa4')),
  created_at       timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  locale      text not null default 'fr' check (locale in ('fr', 'en')),
  phone       text,
  created_at  timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null check (role in ('admin', 'registrar', 'teacher', 'student')),
  created_at      timestamptz not null default now(),
  unique (institution_id, user_id, role)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------
-- 2. Academic structure (LMD): faculty > department > programme,
--    academic year > semester, teaching unit (UE) with credits
-- ---------------------------------------------------------------------
create table public.faculties (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  name            text not null,
  code            text,
  created_at      timestamptz not null default now()
);

create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  faculty_id      uuid references public.faculties (id) on delete set null,
  name            text not null,
  code            text,
  created_at      timestamptz not null default now()
);

create table public.programmes (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete set null,
  name            text not null,
  code            text,
  cycle           text not null default 'licence' check (cycle in ('licence', 'master', 'doctorat', 'other')),
  created_at      timestamptz not null default now()
);

create table public.academic_years (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  label           text not null,
  starts_on       date,
  ends_on         date,
  is_current      boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.semesters (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years (id) on delete cascade,
  label             text not null,
  starts_on         date,
  ends_on           date,
  created_at        timestamptz not null default now()
);

create table public.teaching_units (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  programme_id    uuid references public.programmes (id) on delete set null,
  semester_id     uuid references public.semesters (id) on delete set null,
  code            text not null,
  title           text not null,
  credits         integer not null default 0 check (credits >= 0),
  level           text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Courses and enrollments
-- ---------------------------------------------------------------------
create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  teaching_unit_id  uuid references public.teaching_units (id) on delete set null,
  semester_id       uuid references public.semesters (id) on delete set null,
  code              text not null,
  title             text not null,
  description       text not null default '',
  language          text not null default 'fr' check (language in ('fr', 'en')),
  level             text,
  color             text not null default '#0E7C66' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  published         boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index courses_institution_idx on public.courses (institution_id);

create table public.enrollments (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'student' check (role in ('teacher', 'ta', 'student')),
  created_at      timestamptz not null default now(),
  unique (course_id, user_id)
);
create index enrollments_user_idx on public.enrollments (user_id);

-- ---------------------------------------------------------------------
-- 4. Course content
-- ---------------------------------------------------------------------
create table public.modules (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  title           text not null,
  position        integer not null default 0,
  published       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index modules_course_idx on public.modules (course_id, position);

create table public.pages (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  title           text not null,
  body            text not null default '',
  published       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  course_id         uuid not null references public.courses (id) on delete cascade,
  title             text not null,
  description       text not null default '',
  due_at            timestamptz,
  points_possible   numeric(6, 2) not null default 20 check (points_possible > 0),
  submission_types  text[] not null default array['text', 'file'],
  -- LMD assessment component: contrôle continu, travaux pratiques, examen, rattrapage
  component         text not null default 'cc' check (component in ('cc', 'tp', 'exam', 'resit', 'other')),
  weight            numeric(6, 2) not null default 1 check (weight >= 0),
  published         boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index assignments_course_idx on public.assignments (course_id, due_at);

create table public.module_items (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  module_id       uuid not null references public.modules (id) on delete cascade,
  item_type       text not null check (item_type in ('page', 'assignment', 'link', 'header')),
  title           text not null,
  page_id         uuid references public.pages (id) on delete cascade,
  assignment_id   uuid references public.assignments (id) on delete cascade,
  url             text,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  check (
    (item_type = 'page' and page_id is not null)
    or (item_type = 'assignment' and assignment_id is not null)
    or (item_type = 'link' and url is not null)
    or (item_type = 'header')
  )
);
create index module_items_module_idx on public.module_items (module_id, position);

create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  title           text not null,
  body            text not null default '',
  author_id       uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index announcements_course_idx on public.announcements (course_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. Submissions, grades, and the mark audit log
-- ---------------------------------------------------------------------
create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  body            text,
  file_path       text,
  file_name       text,
  submitted_at    timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- Grades live apart from submissions so teachers can record paper-exam marks.
create table public.grades (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  score           numeric(6, 2) check (score >= 0),
  comment         text,
  graded_by       uuid references public.profiles (id) on delete set null,
  graded_at       timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index grades_course_idx on public.grades (course_id);

create table public.mark_audit_log (
  id              bigint generated always as identity primary key,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  old_score       numeric(6, 2),
  new_score       numeric(6, 2),
  changed_by      uuid references public.profiles (id) on delete set null,
  changed_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Access helpers (security definer: they read memberships without
--    tripping RLS, which avoids policy recursion)
-- ---------------------------------------------------------------------
create or replace function public.is_inst_member(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m where m.institution_id = inst and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_inst_role(inst uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.institution_id = inst and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

create or replace function public.course_role(course uuid)
returns text language sql stable security definer set search_path = public as $$
  select e.role from enrollments e where e.course_id = course and e.user_id = auth.uid();
$$;

create or replace function public.is_course_staff(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.course_id = course and e.user_id = auth.uid() and e.role in ('teacher', 'ta')
  ) or exists (
    select 1 from courses c
    join memberships m on m.institution_id = c.institution_id
    where c.id = course and m.user_id = auth.uid() and m.role in ('admin', 'registrar')
  );
$$;

create or replace function public.is_course_member(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e where e.course_id = course and e.user_id = auth.uid()
  ) or public.is_course_staff(course);
$$;

create or replace function public.shares_institution(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships a
    join memberships b on a.institution_id = b.institution_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------------------------------------------------------------------
-- 7. Triggers: scope rows to the right course/institution server-side,
--    so a client can never write into another school
-- ---------------------------------------------------------------------
create or replace function public.tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'fr' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

create or replace function public.tg_scope_from_course()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
begin
  select c.institution_id into inst from courses c where c.id = new.course_id;
  if inst is null then
    raise exception 'course_not_found';
  end if;
  new.institution_id := inst;
  return new;
end;
$$;

create trigger scope_enrollments before insert or update on public.enrollments
  for each row execute function public.tg_scope_from_course();
create trigger scope_modules before insert or update on public.modules
  for each row execute function public.tg_scope_from_course();
create trigger scope_pages before insert or update on public.pages
  for each row execute function public.tg_scope_from_course();
create trigger scope_assignments before insert or update on public.assignments
  for each row execute function public.tg_scope_from_course();
create trigger scope_announcements before insert or update on public.announcements
  for each row execute function public.tg_scope_from_course();

create or replace function public.tg_scope_module_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m_course uuid;
  m_inst uuid;
begin
  select m.course_id, m.institution_id into m_course, m_inst from modules m where m.id = new.module_id;
  if m_course is null then
    raise exception 'module_not_found';
  end if;
  new.course_id := m_course;
  new.institution_id := m_inst;
  if new.page_id is not null and not exists (
    select 1 from pages p where p.id = new.page_id and p.course_id = m_course
  ) then
    raise exception 'page_not_in_course';
  end if;
  if new.assignment_id is not null and not exists (
    select 1 from assignments a where a.id = new.assignment_id and a.course_id = m_course
  ) then
    raise exception 'assignment_not_in_course';
  end if;
  return new;
end;
$$;

create trigger scope_module_items before insert or update on public.module_items
  for each row execute function public.tg_scope_module_item();

create or replace function public.tg_scope_from_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a_course uuid;
  a_inst uuid;
begin
  select a.course_id, a.institution_id into a_course, a_inst from assignments a where a.id = new.assignment_id;
  if a_course is null then
    raise exception 'assignment_not_found';
  end if;
  new.course_id := a_course;
  new.institution_id := a_inst;
  if tg_table_name = 'submissions' then
    new.submitted_at := now();
  elsif tg_table_name = 'grades' then
    new.graded_at := now();
    new.graded_by := coalesce(auth.uid(), new.graded_by);
  end if;
  return new;
end;
$$;

create trigger scope_submissions before insert or update on public.submissions
  for each row execute function public.tg_scope_from_assignment();
create trigger scope_grades before insert or update on public.grades
  for each row execute function public.tg_scope_from_assignment();

create or replace function public.tg_grade_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.score is distinct from old.score then
    insert into mark_audit_log (institution_id, course_id, assignment_id, student_id, old_score, new_score, changed_by)
    values (
      new.institution_id, new.course_id, new.assignment_id, new.student_id,
      case when tg_op = 'UPDATE' then old.score end,
      new.score,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger audit_grades after insert or update on public.grades
  for each row execute function public.tg_grade_audit();

create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_pages before update on public.pages
  for each row execute function public.tg_touch_updated_at();

-- The creator of a course is always recorded server-side.
create or replace function public.tg_set_course_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

create trigger set_course_creator before insert on public.courses
  for each row execute function public.tg_set_course_creator();

-- A teacher who creates a course is enrolled in it as its teacher.
create or replace function public.tg_enroll_course_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (
    select 1 from memberships m
    where m.institution_id = new.institution_id and m.user_id = auth.uid() and m.role = 'teacher'
  ) then
    insert into enrollments (institution_id, course_id, user_id, role)
    values (new.institution_id, new.id, auth.uid(), 'teacher')
    on conflict (course_id, user_id) do nothing;
  end if;
  return null;
end;
$$;

create trigger enroll_course_creator after insert on public.courses
  for each row execute function public.tg_enroll_course_creator();

-- ---------------------------------------------------------------------
-- 8. RPCs used by the apps
-- ---------------------------------------------------------------------
create or replace function public.create_institution(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into institutions (name, slug) values (trim(p_name), lower(trim(p_slug)))
  returning id into new_id;
  insert into memberships (institution_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return new_id;
end;
$$;

create or replace function public.add_member_by_email(p_institution uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not public.has_inst_role(p_institution, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  if p_role not in ('admin', 'registrar', 'teacher', 'student') then
    raise exception 'invalid_role';
  end if;
  if p_role = 'admin' and not public.has_inst_role(p_institution, array['admin']) then
    raise exception 'forbidden';
  end if;
  select p.id into target from profiles p where lower(p.email) = lower(trim(p_email));
  if target is null then
    raise exception 'user_not_found';
  end if;
  insert into memberships (institution_id, user_id, role)
  values (p_institution, target, p_role)
  on conflict (institution_id, user_id, role) do nothing;
  return target;
end;
$$;

create or replace function public.enroll_by_email(p_course uuid, p_email text, p_role text default 'student')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  inst uuid;
begin
  if not public.is_course_staff(p_course) then
    raise exception 'forbidden';
  end if;
  if p_role not in ('teacher', 'ta', 'student') then
    raise exception 'invalid_role';
  end if;
  select c.institution_id into inst from courses c where c.id = p_course;
  select p.id into target from profiles p where lower(p.email) = lower(trim(p_email));
  if target is null then
    raise exception 'user_not_found';
  end if;
  insert into memberships (institution_id, user_id, role)
  values (inst, target, case when p_role = 'student' then 'student' else 'teacher' end)
  on conflict (institution_id, user_id, role) do nothing;
  insert into enrollments (institution_id, course_id, user_id, role)
  values (inst, p_course, target, p_role)
  on conflict (course_id, user_id) do update set role = excluded.role;
  return target;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Row-level security
-- ---------------------------------------------------------------------
alter table public.institutions   enable row level security;
alter table public.profiles       enable row level security;
alter table public.memberships    enable row level security;
alter table public.faculties      enable row level security;
alter table public.departments    enable row level security;
alter table public.programmes     enable row level security;
alter table public.academic_years enable row level security;
alter table public.semesters      enable row level security;
alter table public.teaching_units enable row level security;
alter table public.courses        enable row level security;
alter table public.enrollments    enable row level security;
alter table public.modules        enable row level security;
alter table public.pages          enable row level security;
alter table public.assignments    enable row level security;
alter table public.module_items   enable row level security;
alter table public.announcements  enable row level security;
alter table public.submissions    enable row level security;
alter table public.grades         enable row level security;
alter table public.mark_audit_log enable row level security;

-- Institutions
create policy institutions_select on public.institutions for select to authenticated
  using (public.is_inst_member(id));
create policy institutions_update on public.institutions for update to authenticated
  using (public.has_inst_role(id, array['admin'])) with check (public.has_inst_role(id, array['admin']));

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_institution(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar']));
create policy memberships_write on public.memberships for all to authenticated
  using (public.has_inst_role(institution_id, array['admin']))
  with check (public.has_inst_role(institution_id, array['admin']));

-- Academic structure: members read, admins and registrars write
do $$
declare
  t text;
begin
  foreach t in array array['faculties', 'departments', 'programmes', 'academic_years', 'semesters', 'teaching_units']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_inst_member(institution_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_inst_role(institution_id, array[''admin'', ''registrar''])) with check (public.has_inst_role(institution_id, array[''admin'', ''registrar'']))',
      t || '_write', t);
  end loop;
end;
$$;

-- Courses
-- (created_by lets INSERT ... RETURNING see the row it just wrote)
create policy courses_select on public.courses for select to authenticated
  using (
    public.is_course_member(id)
    or (created_by = auth.uid() and public.is_inst_member(institution_id))
  );
create policy courses_insert on public.courses for insert to authenticated
  with check (public.has_inst_role(institution_id, array['admin', 'registrar', 'teacher']));
create policy courses_update on public.courses for update to authenticated
  using (public.is_course_staff(id)) with check (public.is_course_staff(id));
create policy courses_delete on public.courses for delete to authenticated
  using (public.has_inst_role(institution_id, array['admin']));

-- Enrollments
create policy enrollments_select on public.enrollments for select to authenticated
  using (public.is_course_member(course_id));
create policy enrollments_write on public.enrollments for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- Modules, pages, assignments: members read published; staff read all and write
create policy modules_select on public.modules for select to authenticated
  using (public.is_course_staff(course_id) or (published and public.is_course_member(course_id)));
create policy modules_write on public.modules for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy pages_select on public.pages for select to authenticated
  using (public.is_course_staff(course_id) or (published and public.is_course_member(course_id)));
create policy pages_write on public.pages for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy assignments_select on public.assignments for select to authenticated
  using (public.is_course_staff(course_id) or (published and public.is_course_member(course_id)));
create policy assignments_write on public.assignments for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy module_items_select on public.module_items for select to authenticated
  using (
    public.is_course_staff(course_id)
    or (
      public.is_course_member(course_id)
      and exists (select 1 from public.modules m where m.id = module_id and m.published)
    )
  );
create policy module_items_write on public.module_items for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- Announcements
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_course_member(course_id));
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- Submissions: students see and write their own; staff see all in the course
create policy submissions_select on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.is_course_staff(course_id));
create policy submissions_insert on public.submissions for insert to authenticated
  with check (student_id = auth.uid() and public.course_role(course_id) = 'student');
create policy submissions_update on public.submissions for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid() and public.course_role(course_id) = 'student');

-- Grades: students read their own; staff read and write
create policy grades_select on public.grades for select to authenticated
  using (student_id = auth.uid() or public.is_course_staff(course_id));
create policy grades_write on public.grades for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- Mark audit log: staff read; only the trigger writes
create policy mark_audit_select on public.mark_audit_log for select to authenticated
  using (public.is_course_staff(course_id));

-- ---------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function
  public.create_institution(text, text),
  public.add_member_by_email(uuid, text, text),
  public.enroll_by_email(uuid, text, text),
  public.is_inst_member(uuid),
  public.has_inst_role(uuid, text[]),
  public.course_role(uuid),
  public.is_course_staff(uuid),
  public.is_course_member(uuid),
  public.shares_institution(uuid)
to authenticated;

-- ---------------------------------------------------------------------
-- 11. Storage: private bucket for submission files
--     Path convention: {course_id}/{assignment_id}/{user_id}/{file}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

create policy submissions_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[3] = auth.uid()::text
    and public.course_role(((storage.foldername(name))[1])::uuid) = 'student'
  );

create policy submissions_files_update on storage.objects for update to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[3] = auth.uid()::text)
  with check (bucket_id = 'submissions' and (storage.foldername(name))[3] = auth.uid()::text);

create policy submissions_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[3] = auth.uid()::text
      or public.is_course_staff(((storage.foldername(name))[1])::uuid)
    )
  );
