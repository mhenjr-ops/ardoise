-- The Ardoise team account is the master view of every university and never a member of
-- one: universities are entered through the console, not by joining them.

create or replace function public.tg_membership_not_platform()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from platform_admins where user_id = new.user_id) then
    raise exception 'platform_account';
  end if;
  return new;
end;
$$;
create trigger membership_not_platform before insert on public.memberships
  for each row execute function public.tg_membership_not_platform();

create or replace function public.tg_platform_not_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from memberships where user_id = new.user_id) then
    raise exception 'platform_account';
  end if;
  return new;
end;
$$;
create trigger platform_not_member before insert on public.platform_admins
  for each row execute function public.tg_platform_not_member();

-- Schools are created from the console with an owner link (create_school); this older
-- entry point creates the school only.
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
  return new_id;
end;
$$;

-- Every university at a glance, for the master dashboard.
create or replace function public.platform_schools()
returns table (
  id uuid, name text, slug text, default_locale text, created_at timestamptz,
  students_listed int, students_joined int, staff int, lecturers int, courses int, departments int,
  active_week int, open_requests int
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
    (select count(distinct e.user_id)::int from enrollments e where e.institution_id = i.id and e.role in ('teacher', 'ta')),
    (select count(*)::int from courses c where c.institution_id = i.id
       and (c.semester_id is null or c.semester_id = public.current_semester(i.id))),
    (select count(*)::int from departments d where d.institution_id = i.id),
    (select count(distinct m.user_id)::int from memberships m join auth.users u on u.id = m.user_id
       where m.institution_id = i.id and u.last_sign_in_at > now() - interval '7 days'),
    (select count(*)::int from support_requests r where r.institution_id = i.id and r.handled_at is null)
  from institutions i
  order by i.name;
end;
$$;

-- Who runs a university (owners, administrators, registrars, deans, heads), for support.
create or replace function public.platform_school_people(p_institution uuid)
returns table (role text, full_name text, email text, scope text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select m.role, p.full_name, p.email, coalesce(d.name, f.name), u.last_sign_in_at
  from memberships m
  join profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  left join departments d on d.id = m.department_id
  left join faculties f on f.id = m.faculty_id
  where m.institution_id = p_institution and m.role in ('owner', 'admin', 'registrar', 'dean', 'hod')
  order by array_position(array['owner', 'admin', 'registrar', 'dean', 'hod'], m.role), p.full_name;
end;
$$;

-- A course's registered students from the registrar's list, including those who haven't
-- created their account yet, with their matricule.
create or replace function public.course_registrations(p_course uuid)
returns table (matricule text, full_name text, user_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from courses where id = p_course;
  if c.id is null or not (public.is_course_staff(c.id) or public.can_oversee_course(c.id)) then
    raise exception 'forbidden';
  end if;
  return query
  select distinct s.matricule, s.full_name, s.claimed_by
  from roster_courses rc join student_roster s on s.id = rc.roster_id
  where rc.institution_id = c.institution_id and upper(rc.course_code) = upper(c.code)
    and (rc.semester_id is null or c.semester_id is null or rc.semester_id = c.semester_id)
  order by s.full_name;
end;
$$;

revoke execute on function public.tg_membership_not_platform(), public.tg_platform_not_member(),
  public.platform_schools(), public.platform_school_people(uuid), public.course_registrations(uuid) from public, anon;
revoke execute on function public.tg_membership_not_platform(), public.tg_platform_not_member() from authenticated;
grant execute on function public.platform_schools(), public.platform_school_people(uuid), public.course_registrations(uuid)
  to authenticated;
