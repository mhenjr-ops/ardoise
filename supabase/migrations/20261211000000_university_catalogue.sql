-- University course catalogue.
--
-- Each university keeps one list of all its courses: code, title, year of study, semester,
-- credits and the department(s) that take it. A semester's course (the existing `courses`
-- row, with its lecturers, students and content) is opened from the catalogue when a lecturer
-- claims it. Students then join on their own: those registered in a programme of one of the
-- course's departments, in that year of study, for that semester, unless the registrar's
-- student file lists their courses for the semester (that list wins). A student can drop a
-- course they were added to this way, and is not added back.
--
-- Courses that arrive another way (the registrar's file, a lecturer creating one) are added
-- to the catalogue automatically, so the catalogue always has every course. Staff can add a
-- course that isn't listed; the registrar, admins, deans, heads of department and the
-- Ardoise team can edit or retire entries and import a whole list from a spreadsheet.

-- 1. Tables ------------------------------------------------------------------------------

create table public.catalogue_courses (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  code            text not null check (length(code) between 1 and 40),
  title           text not null check (length(title) between 1 and 300),
  level           smallint check (level between 1 and 8),
  semester_no     smallint check (semester_no in (1, 2)),
  credits         numeric(4, 1) check (credits between 0 and 60),
  source          text not null default 'manual' check (source in ('manual', 'import', 'course')),
  retired_at      timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index catalogue_courses_code_key on public.catalogue_courses (institution_id, upper(code));
create index catalogue_courses_level_idx on public.catalogue_courses (institution_id, level, semester_no);

create table public.catalogue_course_departments (
  catalogue_id   uuid not null references public.catalogue_courses (id) on delete cascade,
  department_id  uuid not null references public.departments (id) on delete cascade,
  primary key (catalogue_id, department_id)
);
create index catalogue_course_departments_dep_idx on public.catalogue_course_departments (department_id);

alter table public.courses add column catalogue_id uuid references public.catalogue_courses (id) on delete set null;
create index courses_catalogue_idx on public.courses (catalogue_id);

-- How a student came to be in a course: 'auto' (from the catalogue) can be dropped by them.
alter table public.enrollments add column added_by text check (added_by in ('auto'));

-- A student who dropped an automatic course is not added back to it.
create table public.course_opt_outs (
  course_id   uuid not null references public.courses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- Codes are written one way, as for courses ("CSC 201" and "csc201" are CSC201).
create or replace function public.tg_catalogue_course()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.code := upper(regexp_replace(trim(new.code), '\s+', '', 'g'));
  new.title := left(regexp_replace(trim(new.title), '\s+', ' ', 'g'), 300);
  if length(new.code) not between 1 and 40 or new.title = '' then
    raise exception 'invalid';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger catalogue_course before insert or update on public.catalogue_courses
  for each row execute function public.tg_catalogue_course();

-- A department link must stay inside the university.
create or replace function public.tg_catalogue_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from catalogue_courses c join departments d on d.institution_id = c.institution_id
    where c.id = new.catalogue_id and d.id = new.department_id) then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger catalogue_department before insert or update on public.catalogue_course_departments
  for each row execute function public.tg_catalogue_department();

alter table public.catalogue_courses enable row level security;
alter table public.catalogue_course_departments enable row level security;
alter table public.course_opt_outs enable row level security;
create policy catalogue_courses_select on public.catalogue_courses for select to authenticated
  using (public.is_inst_member(institution_id) or public.is_platform_admin());
create policy catalogue_course_departments_select on public.catalogue_course_departments for select to authenticated
  using (exists (select 1 from catalogue_courses c where c.id = catalogue_id
                 and (public.is_inst_member(c.institution_id) or public.is_platform_admin())));
create policy course_opt_outs_own on public.course_opt_outs for select to authenticated using (user_id = auth.uid());
create policy two_step on public.catalogue_courses as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy two_step on public.catalogue_course_departments as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy two_step on public.course_opt_outs as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select on public.catalogue_courses, public.catalogue_course_departments, public.course_opt_outs to authenticated;

-- 2. Helpers -----------------------------------------------------------------------------

-- Year of study from how a level is written: L1-L3, M1-M2 (after a 3-year licence),
-- "Year 2", "Niveau 2", "2", or UBa's "Level 200" (= year 1, like its course codes).
create or replace function public.level_year(p text)
returns smallint language sql immutable set search_path = public as $$
  select case
    when p is null or trim(p) = '' then null
    when p ~* '^\s*l\s*[1-8]\s*$' then substring(p from '[1-8]')::smallint
    when p ~* '^\s*m\s*[1-3]\s*$' then (3 + substring(p from '[1-3]')::int)::smallint
    when p ~* '(year|ann[ée]e|niveau|level)\s*[1-8]\s*$' then substring(p from '([1-8])\s*$')::smallint
    when p ~* '[2-9]00\s*$' then (substring(p from '([2-9])00\s*$')::int - 1)::smallint
    when p ~ '^\s*[1-8]\s*$' then trim(p)::smallint
    else null
  end
$$;

-- 1 or 2: a semester's place in its academic year.
create or replace function public.semester_no(p_sem uuid)
returns smallint language sql stable security definer set search_path = public as $$
  select least(x.n, 2)::smallint from (
    select s.id, row_number() over (order by s.starts_on nulls last, s.label) as n
    from semesters s
    where s.academic_year_id = (select academic_year_id from semesters where id = p_sem)
  ) x where x.id = p_sem
$$;

-- The semester a catalogue course runs in this year: the current academic year's semester
-- with its number (1 or 2), else the current semester.
create or replace function public.catalogue_semester(inst uuid, p_no int)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.id from semesters s
     where p_no is not null
       and s.academic_year_id = (select academic_year_id from semesters where id = public.current_semester(inst))
       and public.semester_no(s.id) = p_no
     limit 1),
    public.current_semester(inst))
$$;

create or replace function public.can_edit_catalogue(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.has_inst_role(inst, array['admin', 'registrar', 'dean', 'hod'])
$$;

-- Any lecturer or office member may add a course that isn't listed.
create or replace function public.can_add_catalogue(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit_catalogue(inst) or public.is_school_staff(inst)
$$;

-- 3. Every course has a catalogue entry -----------------------------------------------------

-- A course created any other way joins (or starts) the catalogue entry with its code.
create or replace function public.tg_courses_catalogue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cat uuid;
begin
  if new.catalogue_id is null then
    select id into cat from catalogue_courses where institution_id = new.institution_id and upper(code) = upper(new.code);
    if cat is null then
      insert into catalogue_courses (institution_id, code, title, level, semester_no, source, created_by)
      values (new.institution_id, new.code, coalesce(nullif(trim(new.title), ''), new.code), public.level_year(new.level),
              case when new.semester_id is not null then public.semester_no(new.semester_id) end, 'course', auth.uid())
      returning id into cat;
    end if;
    new.catalogue_id := cat;
  elsif not exists (select 1 from catalogue_courses where id = new.catalogue_id and institution_id = new.institution_id) then
    raise exception 'invalid';
  end if;
  if new.department_id is not null then
    insert into catalogue_course_departments (catalogue_id, department_id) values (new.catalogue_id, new.department_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger courses_catalogue before insert or update of code, catalogue_id, department_id on public.courses
  for each row execute function public.tg_courses_catalogue();

-- Existing courses: one entry per code per university.
insert into public.catalogue_courses (institution_id, code, title, level, semester_no, source, created_by)
select distinct on (c.institution_id, upper(c.code))
  c.institution_id, c.code, c.title, public.level_year(c.level),
  case when c.semester_id is not null then public.semester_no(c.semester_id) end, 'course', c.created_by
from public.courses c
order by c.institution_id, upper(c.code), c.created_at desc
on conflict do nothing;
update public.courses c set catalogue_id = cc.id
from public.catalogue_courses cc
where cc.institution_id = c.institution_id and upper(cc.code) = upper(c.code) and c.catalogue_id is null;
insert into public.catalogue_course_departments (catalogue_id, department_id)
select distinct c.catalogue_id, c.department_id from public.courses c
where c.catalogue_id is not null and c.department_id is not null
on conflict do nothing;

-- 4. Students join automatically ----------------------------------------------------------

-- The students a course takes on its own: in a programme of one of its departments, in its
-- year of study, in the course's academic year; not those whose courses the registrar listed
-- for that semester, and not those who dropped it.
create or replace function public.auto_enrol_course(p_course uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int;
begin
  select co.id, co.institution_id, co.semester_id, cc.level, cc.semester_no, s.academic_year_id,
         public.semester_no(co.semester_id) as sem_no, cc.id as cat
    into c
  from courses co
  join catalogue_courses cc on cc.id = co.catalogue_id
  join semesters s on s.id = co.semester_id
  where co.id = p_course and cc.retired_at is null;
  if c.id is null or c.level is null or (c.semester_no is not null and c.semester_no <> c.sem_no) then
    return 0;
  end if;
  insert into enrollments (institution_id, course_id, user_id, role, added_by)
  select distinct c.institution_id, c.id, pe.student_id, 'student', 'auto'
  from programme_enrollments pe
  join programmes p on p.id = pe.programme_id
  join catalogue_course_departments cd on cd.catalogue_id = c.cat and cd.department_id = p.department_id
  where pe.institution_id = c.institution_id
    and pe.academic_year_id = c.academic_year_id
    and public.level_year(pe.level) = c.level
    and not exists (select 1 from roster_courses rc join student_roster sr on sr.id = rc.roster_id
                    where sr.claimed_by = pe.student_id and sr.institution_id = c.institution_id
                      and rc.semester_id = c.semester_id)
    and not exists (select 1 from course_opt_outs o where o.course_id = c.id and o.user_id = pe.student_id)
  on conflict (course_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A student placed in a programme (or moved to another year) joins that year's courses
-- that are already open for their department and year.
create or replace function public.auto_enrol_student(p_student uuid, p_institution uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  total int := 0;
  r record;
begin
  for r in
    select distinct co.id
    from courses co
    join catalogue_courses cc on cc.id = co.catalogue_id and cc.retired_at is null
    join catalogue_course_departments cd on cd.catalogue_id = cc.id
    join programmes p on p.department_id = cd.department_id
    join programme_enrollments pe on pe.programme_id = p.id and pe.student_id = p_student
    join semesters s on s.id = co.semester_id and s.academic_year_id = pe.academic_year_id
    where co.institution_id = p_institution
      and public.level_year(pe.level) = cc.level
  loop
    total := total + public.auto_enrol_course(r.id);
  end loop;
  return total;
end;
$$;

create or replace function public.tg_course_auto_enrol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.catalogue_id is not null and new.semester_id is not null then
    perform public.auto_enrol_course(new.id);
  end if;
  return null;
end;
$$;
create trigger course_auto_enrol after insert on public.courses
  for each row execute function public.tg_course_auto_enrol();

create or replace function public.tg_programme_auto_enrol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.auto_enrol_student(new.student_id, new.institution_id);
  return null;
end;
$$;
create trigger programme_auto_enrol after insert or update of level, programme_id on public.programme_enrollments
  for each row execute function public.tg_programme_auto_enrol();

-- A student drops a course they were added to automatically (an elective they don't take).
create or replace function public.drop_course(p_course uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'forbidden';
  end if;
  delete from enrollments
  where course_id = p_course and user_id = auth.uid() and role = 'student' and added_by = 'auto';
  if not found then
    raise exception 'forbidden';
  end if;
  insert into course_opt_outs (course_id, user_id) values (p_course, auth.uid()) on conflict do nothing;
end;
$$;

-- 5. Lecturers: search the catalogue and claim a course ------------------------------------

create or replace function public.catalogue_search(
  p_institution uuid, p_query text default '', p_department uuid default null,
  p_level int default null, p_semester int default null, p_mine boolean default false,
  p_offset int default 0, p_limit int default 50
) returns table (
  id uuid, code text, title text, level smallint, semester_no smallint, credits numeric,
  departments text, department_ids uuid[], retired boolean, course_id uuid, teachers text, teaching boolean, students int, total bigint
) language plpgsql stable security definer set search_path = public as $$
declare
  q text := coalesce(trim(p_query), '');
begin
  if not (public.is_school_staff(p_institution) or public.is_platform_admin()) then
    raise exception 'forbidden';
  end if;
  return query
  with f as (
    select cc.*
    from catalogue_courses cc
    where cc.institution_id = p_institution
      and (public.can_edit_catalogue(p_institution) or cc.retired_at is null)
      and (q = '' or cc.code ilike '%' || q || '%' or cc.title ilike '%' || q || '%')
      and (p_department is null or exists (select 1 from catalogue_course_departments d
                                           where d.catalogue_id = cc.id and d.department_id = p_department))
      and (p_level is null or cc.level = p_level)
      and (p_semester is null or cc.semester_no = p_semester)
      and (not p_mine or exists (select 1 from courses co join enrollments e on e.course_id = co.id
                                 where co.catalogue_id = cc.id
                                   and co.semester_id = public.catalogue_semester(p_institution, cc.semester_no)
                                   and e.user_id = auth.uid() and e.role in ('teacher', 'ta')))
  ), page as (
    select f.*, count(*) over () as total from f
    order by (q <> '' and upper(f.code) = upper(q)) desc, f.code
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)
  )
  select pg.id, pg.code, pg.title, pg.level, pg.semester_no, pg.credits,
    coalesce((select string_agg(d.name, ', ' order by d.name) from catalogue_course_departments cd
              join departments d on d.id = cd.department_id where cd.catalogue_id = pg.id), ''),
    coalesce((select array_agg(cd.department_id) from catalogue_course_departments cd where cd.catalogue_id = pg.id), '{}'),
    pg.retired_at is not null,
    o.id,
    coalesce((select string_agg(p.full_name, ', ' order by p.full_name) from enrollments e
              join profiles p on p.id = e.user_id where e.course_id = o.id and e.role in ('teacher', 'ta')), ''),
    exists (select 1 from enrollments e where e.course_id = o.id and e.user_id = auth.uid() and e.role in ('teacher', 'ta')),
    (select count(*)::int from enrollments e where e.course_id = o.id and e.role = 'student'),
    pg.total
  from page pg
  left join lateral (select co.id from courses co
                     where co.catalogue_id = pg.id and co.semester_id = public.catalogue_semester(p_institution, pg.semester_no)
                     order by co.created_at limit 1) o on true
  order by (q <> '' and upper(pg.code) = upper(q)) desc, pg.code;
end;
$$;

-- Lecturers may not set a course's semester, unit or weights themselves; opening a course
-- from the catalogue (below) sets its semester for them, so that path is let through.
create or replace function public.tg_guard_course_lmd()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := new.teaching_unit_id is not null or new.semester_id is not null
      or new.coefficient <> 1 or new.component_weights is not null;
  else
    changed := new.teaching_unit_id is distinct from old.teaching_unit_id
      or new.semester_id is distinct from old.semester_id
      or new.coefficient is distinct from old.coefficient
      or new.component_weights is distinct from old.component_weights;
  end if;
  if changed and auth.uid() is not null
     and not (tg_op = 'INSERT' and coalesce(current_setting('ardoise.catalogue_open', true), '') = 'on'
              and new.teaching_unit_id is null and new.coefficient = 1 and new.component_weights is null)
     and not public.has_inst_role(new.institution_id, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  if new.teaching_unit_id is not null and not exists (
    select 1 from teaching_units tu where tu.id = new.teaching_unit_id and tu.institution_id = new.institution_id
  ) then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;

-- The course for this year, in its own semester (a second-semester course opened now is
-- opened for the second semester), opened from the catalogue if nobody has yet.
create or replace function public.open_catalogue_course(p_catalogue uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cc record;
  sem uuid;
  cid uuid;
  dep uuid;
  lang text;
begin
  select * into cc from catalogue_courses where id = p_catalogue;
  if cc.id is null or not public.is_school_staff(cc.institution_id) then
    raise exception 'forbidden';
  end if;
  if cc.retired_at is not null then
    raise exception 'invalid';
  end if;
  sem := public.catalogue_semester(cc.institution_id, cc.semester_no);
  select id into cid from courses
  where institution_id = cc.institution_id and semester_id = sem
    and (catalogue_id = cc.id or upper(code) = upper(cc.code))
  order by (catalogue_id = cc.id) desc, created_at limit 1;
  if cid is not null then
    update courses set catalogue_id = cc.id where id = cid and catalogue_id is distinct from cc.id;
    return cid;
  end if;
  -- The lecturer's own department if the course belongs to it, else the course's first one.
  select cd.department_id into dep from catalogue_course_departments cd
  left join memberships m on m.institution_id = cc.institution_id and m.user_id = auth.uid() and m.department_id = cd.department_id
  where cd.catalogue_id = cc.id
  order by (m.user_id is not null) desc, cd.department_id limit 1;
  select default_locale into lang from institutions where id = cc.institution_id;
  perform set_config('ardoise.catalogue_open', 'on', true);
  insert into courses (institution_id, code, title, department_id, semester_id, catalogue_id, level, language, created_by)
  values (cc.institution_id, cc.code, cc.title, dep, sem, cc.id,
          case when cc.level is null then null when lang = 'fr' then 'Niveau ' || cc.level else 'Year ' || cc.level end,
          coalesce(lang, 'en'), auth.uid())
  returning id into cid;
  perform set_config('ardoise.catalogue_open', 'off', true);
  return cid;
end;
$$;

-- "I teach this": open the course for the semester if needed, then join it as its lecturer.
create or replace function public.teach_catalogue_course(p_catalogue uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.open_catalogue_course(p_catalogue);
begin
  perform public.teach_course(cid);
  return cid;
end;
$$;

-- 6. Adding, editing and importing ----------------------------------------------------------

create or replace function public.catalogue_save(
  p_institution uuid, p_id uuid, p_code text, p_title text, p_level int, p_semester int,
  p_credits numeric, p_departments uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := p_id;
begin
  if p_id is null and not public.can_add_catalogue(p_institution) then
    raise exception 'forbidden';
  end if;
  if p_id is not null and not public.can_edit_catalogue(p_institution) then
    raise exception 'forbidden';
  end if;
  if p_level is not null and p_level not between 1 and 8 or p_semester is not null and p_semester not in (1, 2) then
    raise exception 'invalid';
  end if;
  if exists (select 1 from catalogue_courses where institution_id = p_institution
             and upper(code) = upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'))
             and (p_id is null or id <> p_id)) then
    raise exception 'duplicate_code';
  end if;
  if p_id is null then
    insert into catalogue_courses (institution_id, code, title, level, semester_no, credits, source, created_by)
    values (p_institution, coalesce(p_code, ''), coalesce(p_title, ''), p_level, p_semester, p_credits, 'manual', auth.uid())
    returning id into cid;
  else
    update catalogue_courses set code = coalesce(p_code, ''), title = coalesce(p_title, ''), level = p_level,
      semester_no = p_semester, credits = p_credits
    where id = p_id and institution_id = p_institution;
    if not found then
      raise exception 'not_found';
    end if;
    delete from catalogue_course_departments where catalogue_id = cid and not (department_id = any (coalesce(p_departments, '{}')));
  end if;
  insert into catalogue_course_departments (catalogue_id, department_id)
  select cid, d.id from departments d
  where d.institution_id = p_institution and d.id = any (coalesce(p_departments, '{}'))
  on conflict do nothing;
  return cid;
end;
$$;

create or replace function public.catalogue_retire(p_id uuid, p_retired boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  inst uuid := (select institution_id from catalogue_courses where id = p_id);
begin
  if inst is null or not public.can_edit_catalogue(inst) then
    raise exception 'forbidden';
  end if;
  update catalogue_courses set retired_at = case when p_retired then coalesce(retired_at, now()) end where id = p_id;
end;
$$;

-- A whole list from a spreadsheet: rows of {code, title, level, semester, credits, school,
-- department}. A code already listed is updated (title, level, semester, credits filled in
-- when given) and gains the row's department. Departments are found by name within the
-- school (by name or code); the Ardoise team's imports create the ones that are missing.
create or replace function public.catalogue_import(p_institution uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  team boolean := public.is_platform_admin();
  item jsonb;
  v_code text;
  v_title text;
  lvl int;
  sem int;
  cred numeric;
  fac uuid;
  dep uuid;
  cid uuid;
  created int := 0;
  updated int := 0;
  linked int := 0;
  new_deps int := 0;
  skipped int := 0;
  unknown text[] := '{}';
  school text;
  dname text;
begin
  if not public.can_edit_catalogue(p_institution) then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'invalid';
  end if;
  for item in select * from jsonb_array_elements(p_rows) loop
    v_code := upper(regexp_replace(trim(coalesce(item ->> 'code', '')), '\s+', '', 'g'));
    v_title := regexp_replace(trim(coalesce(item ->> 'title', '')), '\s+', ' ', 'g');
    if v_code = '' or length(v_code) > 40 or (v_title = '' and not exists (
         select 1 from catalogue_courses cc where cc.institution_id = p_institution and upper(cc.code) = v_code)) then
      skipped := skipped + 1;
      continue;
    end if;
    lvl := case when (item ->> 'level') ~ '^[1-8]$' then (item ->> 'level')::int else public.level_year(item ->> 'level') end;
    sem := case when (item ->> 'semester') ~ '^\s*[12]\s*$' then trim(item ->> 'semester')::int end;
    cred := case when (item ->> 'credits') ~ '^\s*\d{1,2}(\.\d)?\s*$' then trim(item ->> 'credits')::numeric end;

    select cc.id into cid from catalogue_courses cc where cc.institution_id = p_institution and upper(cc.code) = v_code;
    if cid is null then
      insert into catalogue_courses (institution_id, code, title, level, semester_no, credits, source, created_by)
      values (p_institution, v_code, left(v_title, 300), lvl, sem, cred, 'import', auth.uid())
      returning id into cid;
      created := created + 1;
    else
      update catalogue_courses cc set
        title = coalesce(nullif(left(v_title, 300), ''), cc.title),
        level = coalesce(lvl, cc.level),
        semester_no = coalesce(sem, cc.semester_no),
        credits = coalesce(cred, cc.credits)
      where cc.id = cid;
      updated := updated + 1;
    end if;

    school := nullif(trim(coalesce(item ->> 'school', '')), '');
    dname := nullif(regexp_replace(trim(coalesce(item ->> 'department', '')), '\s+', ' ', 'g'), '');
    if dname is not null then
      fac := null;
      if school is not null then
        select id into fac from faculties
        where institution_id = p_institution and (lower(name) = lower(school) or lower(coalesce(code, '')) = lower(school))
        limit 1;
      end if;
      select d.id into dep from departments d
      where d.institution_id = p_institution and lower(d.name) = lower(dname)
        and (fac is null or d.faculty_id = fac)
      order by (d.faculty_id = fac) desc nulls last limit 1;
      if dep is null and team and fac is not null then
        insert into departments (institution_id, faculty_id, name) values (p_institution, fac, left(dname, 200))
        returning id into dep;
        new_deps := new_deps + 1;
      end if;
      if dep is null then
        if not (coalesce(school, '') || ' / ' || dname = any (unknown)) and coalesce(array_length(unknown, 1), 0) < 50 then
          unknown := unknown || (coalesce(school, '') || ' / ' || dname);
        end if;
      else
        insert into catalogue_course_departments (catalogue_id, department_id) values (cid, dep) on conflict do nothing;
        if found then
          linked := linked + 1;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated, 'linked', linked,
    'new_departments', new_deps, 'skipped', skipped, 'unknown_departments', to_jsonb(unknown));
end;
$$;

-- 7. Access --------------------------------------------------------------------------------

revoke execute on function public.tg_catalogue_course(), public.tg_catalogue_department(), public.tg_courses_catalogue(),
  public.tg_course_auto_enrol(), public.tg_programme_auto_enrol(), public.auto_enrol_course(uuid),
  public.auto_enrol_student(uuid, uuid), public.open_catalogue_course(uuid)
  from public, anon, authenticated;
revoke execute on function public.catalogue_semester(uuid, int) from public, anon, authenticated;
revoke execute on function public.level_year(text), public.semester_no(uuid), public.can_edit_catalogue(uuid),
  public.can_add_catalogue(uuid), public.drop_course(uuid), public.catalogue_search(uuid, text, uuid, int, int, boolean, int, int),
  public.teach_catalogue_course(uuid), public.catalogue_save(uuid, uuid, text, text, int, int, numeric, uuid[]),
  public.catalogue_retire(uuid, boolean), public.catalogue_import(uuid, jsonb)
  from public, anon;
grant execute on function public.level_year(text), public.semester_no(uuid), public.can_edit_catalogue(uuid),
  public.can_add_catalogue(uuid), public.drop_course(uuid), public.catalogue_search(uuid, text, uuid, int, int, boolean, int, int),
  public.teach_catalogue_course(uuid), public.catalogue_save(uuid, uuid, text, text, int, int, numeric, uuid[]),
  public.catalogue_retire(uuid, boolean), public.catalogue_import(uuid, jsonb)
  to authenticated;
