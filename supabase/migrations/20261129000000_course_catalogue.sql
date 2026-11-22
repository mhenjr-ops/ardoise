-- One course per code per semester, filled from the registrar's student file, and taught
-- by whichever lecturers add it to their own dashboard (two lecturers, one course).

-- The semester a school is in today (dates first, then the current year's earliest semester).
create or replace function public.current_semester(inst uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id
  from semesters s join academic_years y on y.id = s.academic_year_id
  where s.institution_id = inst
  order by (s.starts_on <= current_date and current_date <= s.ends_on) is true desc,
           y.is_current desc,
           (s.ends_on >= current_date) is true desc,
           s.starts_on nulls last,
           s.label
  limit 1;
$$;

-- Course codes are written one way ("CSC 201" and "csc201" are both CSC201), and new
-- courses land in the current semester unless one is given.
create or replace function public.tg_course_semester()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.code := upper(regexp_replace(trim(new.code), '\s+', '', 'g'));
  if length(new.code) not between 1 and 40 then
    raise exception 'invalid';
  end if;
  if tg_op = 'INSERT' and new.semester_id is null then
    new.semester_id := public.current_semester(new.institution_id);
  elsif new.semester_id is not null
    and not exists (select 1 from semesters where id = new.semester_id and institution_id = new.institution_id) then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger course_semester before insert or update of code, semester_id on public.courses
  for each row execute function public.tg_course_semester();

-- No duplicates: a code exists once per semester.
create unique index courses_code_semester_key on public.courses (
  institution_id, upper(code), coalesce(semester_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- The student list remembers which semester each registration is for.
alter table public.roster_courses add column semester_id uuid references public.semesters (id) on delete cascade;
alter table public.roster_courses drop constraint roster_courses_pkey;
create unique index roster_courses_key on public.roster_courses (
  roster_id, upper(course_code), coalesce(semester_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- A registration (code + semester) points at the course with that code in that semester.
create or replace function public.course_for(inst uuid, ccode text, sem uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from courses c
  where c.institution_id = inst and upper(c.code) = upper(ccode)
    and (sem is null or c.semester_id = sem or c.semester_id is null)
  order by (c.semester_id = sem) is true desc, c.created_at desc
  limit 1;
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
  update matricule_claims set status = 'resolved', resolved_at = now()
  where institution_id = r.institution_id and user_id = p_user and status = 'waiting';
end;
$$;
revoke execute on function public.link_student(uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_course_roster()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into enrollments (institution_id, course_id, user_id, role)
  select new.institution_id, new.id, s.claimed_by, 'student'
  from roster_courses rc join student_roster s on s.id = rc.roster_id
  where rc.institution_id = new.institution_id and upper(rc.course_code) = upper(new.code)
    and (rc.semester_id is null or new.semester_id is null or rc.semester_id = new.semester_id)
    and s.claimed_by is not null
  on conflict (course_id, user_id) do nothing;
  return null;
end;
$$;

-- The registrar's file: students, their registrations for one semester, and the courses
-- themselves (code + title, optional department), created when missing.
drop function public.import_roster(uuid, jsonb);
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
    continue when length(ccode) not between 1 and 40 or ctitle = '';
    if not exists (select 1 from courses where institution_id = p_institution and upper(code) = ccode
                   and semester_id is not distinct from sem) then
      dep := null;
      if nullif(trim(coalesce(cx ->> 'department', '')), '') is not null then
        select id into dep from departments
        where institution_id = p_institution and (lower(name) = lower(trim(cx ->> 'department')) or lower(code) = lower(trim(cx ->> 'department')))
        limit 1;
      end if;
      insert into courses (institution_id, code, title, semester_id, department_id, language, created_by)
      values (p_institution, ccode, ctitle, sem, dep, case when lang = 'fr' then 'fr' else 'en' end, auth.uid());
      new_courses := new_courses + 1;
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

-- Lecturers see the school's courses for the semester and add the ones they teach.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'announcement', 'assignment', 'grade', 'submission', 'message', 'discussion', 'results', 'attendance', 'teaching'));

create or replace function public.is_school_staff(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where institution_id = inst and user_id = auth.uid()
                 and role in ('owner', 'admin', 'registrar', 'dean', 'hod', 'teacher'));
$$;

create or replace function public.course_catalogue(p_query text default '')
returns table (id uuid, code text, title text, department text, semester text, teachers text, teaching boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.code, c.title, d.name, s.label,
         coalesce((select string_agg(p.full_name, ', ' order by p.full_name)
                   from enrollments e join profiles p on p.id = e.user_id
                   where e.course_id = c.id and e.role in ('teacher', 'ta')), ''),
         exists (select 1 from enrollments e where e.course_id = c.id and e.user_id = auth.uid() and e.role in ('teacher', 'ta'))
  from courses c
  left join departments d on d.id = c.department_id
  left join semesters s on s.id = c.semester_id
  where public.is_school_staff(c.institution_id)
    and (c.semester_id is null or c.semester_id = public.current_semester(c.institution_id))
    and (coalesce(trim(p_query), '') = ''
         or c.code ilike '%' || trim(p_query) || '%' or c.title ilike '%' || trim(p_query) || '%'
         or d.name ilike '%' || trim(p_query) || '%')
  order by c.code
  limit 200;
$$;

create or replace function public.teach_course(p_course uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  me text := (select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid());
begin
  select * into c from courses where id = p_course;
  if c.id is null or not public.is_school_staff(c.institution_id) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from enrollments where course_id = c.id and user_id = auth.uid()) then
    return;
  end if;
  insert into memberships (institution_id, user_id, role) values (c.institution_id, auth.uid(), 'teacher')
  on conflict do nothing;
  insert into enrollments (institution_id, course_id, user_id, role) values (c.institution_id, c.id, auth.uid(), 'teacher');
  -- The head of the department and the course's other lecturers see who joined.
  perform public.notify_users(
    array(select m.user_id from memberships m where m.institution_id = c.institution_id and m.role = 'hod'
            and c.department_id is not null and m.department_id = c.department_id
          union select e.user_id from enrollments e where e.course_id = c.id and e.role in ('teacher', 'ta')),
    c.institution_id, c.id, 'teaching', jsonb_build_object('course', c.code, 'teacher', me),
    '/courses/' || c.id || '/people');
end;
$$;

create or replace function public.leave_course(p_course uuid)
returns void language sql security definer set search_path = public as $$
  delete from enrollments where course_id = p_course and user_id = auth.uid() and role in ('teacher', 'ta');
$$;

revoke execute on function public.current_semester(uuid), public.tg_course_semester(), public.course_for(uuid, text, uuid),
  public.import_roster(uuid, jsonb, uuid, jsonb), public.is_school_staff(uuid), public.course_catalogue(text),
  public.teach_course(uuid), public.leave_course(uuid) from public, anon;
revoke execute on function public.tg_course_semester(), public.course_for(uuid, text, uuid) from authenticated;
grant execute on function public.current_semester(uuid), public.import_roster(uuid, jsonb, uuid, jsonb),
  public.is_school_staff(uuid), public.course_catalogue(text), public.teach_course(uuid), public.leave_course(uuid)
  to authenticated;
