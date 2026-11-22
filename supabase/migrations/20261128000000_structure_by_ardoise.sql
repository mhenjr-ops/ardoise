-- The Ardoise team sets up each school's structure (faculties and schools, departments,
-- programmes, academic years, semesters, teaching units). Schools see it and ask for
-- changes; they don't build it themselves.

-- Faculties and schools/colleges/institutes are listed separately.
alter table public.faculties
  add column kind text not null default 'faculty' check (kind in ('faculty', 'school'));

-- Higher National Diploma programmes.
alter table public.programmes drop constraint programmes_cycle_check;
alter table public.programmes add constraint programmes_cycle_check
  check (cycle in ('licence', 'master', 'doctorat', 'hnd', 'other'));

-- Members read their school's structure; only the Ardoise team writes it.
do $$
declare
  t text;
begin
  foreach t in array array['faculties', 'departments', 'programmes', 'academic_years', 'semesters', 'teaching_units'] loop
    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_inst_member(institution_id) or public.is_platform_admin())',
      t || '_select', t);
    execute format('drop policy %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      t || '_write', t);
  end loop;
end;
$$;

-- A whole structure at once, from the console. Additive: matches existing units by code
-- or name (case-insensitive), departments and programmes by name within their parent,
-- and only creates what is missing.
create or replace function public.import_structure(p_institution uuid, p_units jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u jsonb;
  d jsonb;
  p jsonb;
  fid uuid;
  did uuid;
  pid uuid;
  uname text;
  ucode text;
  dname text;
  dcode text;
  pname text;
  pcode text;
  pcycle text;
  nf int := 0;
  nd int := 0;
  np int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from institutions where id = p_institution)
     or jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) > 200 then
    raise exception 'invalid';
  end if;
  for u in select * from jsonb_array_elements(p_units) loop
    uname := nullif(left(trim(coalesce(u ->> 'name', '')), 200), '');
    ucode := nullif(left(trim(coalesce(u ->> 'code', '')), 20), '');
    fid := null;
    if uname is not null or ucode is not null then
      select f.id into fid from faculties f
      where f.institution_id = p_institution
        and ((ucode is not null and lower(f.code) = lower(ucode))
          or (uname is not null and (lower(f.name) = lower(uname) or lower(f.code) = lower(uname))))
      order by (ucode is not null and lower(f.code) = lower(ucode)) desc
      limit 1;
      if fid is null then
        insert into faculties (institution_id, name, code, kind)
        values (p_institution, coalesce(uname, ucode), ucode, case when u ->> 'kind' = 'school' then 'school' else 'faculty' end)
        returning id into fid;
        nf := nf + 1;
      end if;
    end if;

    for d in select * from jsonb_array_elements(coalesce(u -> 'departments', '[]'::jsonb)) loop
      dname := nullif(left(trim(coalesce(d ->> 'name', '')), 200), '');
      dcode := nullif(left(trim(coalesce(d ->> 'code', '')), 20), '');
      continue when dname is null;
      select x.id into did from departments x
      where x.institution_id = p_institution
        and (lower(x.name) = lower(dname) or (dcode is not null and lower(x.code) = lower(dcode)))
        and (x.faculty_id is not distinct from fid or x.faculty_id is null)
      order by (x.faculty_id is not distinct from fid) desc
      limit 1;
      if did is null then
        insert into departments (institution_id, faculty_id, name, code)
        values (p_institution, fid, dname, dcode)
        returning id into did;
        nd := nd + 1;
      elsif fid is not null then
        update departments set faculty_id = fid where id = did and faculty_id is null;
      end if;

      for p in select * from jsonb_array_elements(coalesce(d -> 'programmes', '[]'::jsonb)) loop
        pname := nullif(left(trim(coalesce(p ->> 'name', '')), 200), '');
        pcode := nullif(left(trim(coalesce(p ->> 'code', '')), 20), '');
        pcycle := case when p ->> 'cycle' in ('licence', 'master', 'doctorat', 'hnd', 'other') then p ->> 'cycle' else 'licence' end;
        continue when pname is null;
        select x.id into pid from programmes x
        where x.institution_id = p_institution and x.department_id = did
          and (lower(x.name) = lower(pname) or (pcode is not null and lower(x.code) = lower(pcode)))
        limit 1;
        if pid is null then
          insert into programmes (institution_id, department_id, name, code, cycle)
          values (p_institution, did, pname, pcode, pcycle);
          np := np + 1;
        end if;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('units', nf, 'departments', nd, 'programmes', np);
end;
$$;

-- Schools ask the Ardoise team for changes (a new department, a renamed programme...).
create table public.support_requests (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  body            text not null check (length(trim(body)) between 3 and 4000),
  created_at      timestamptz not null default now(),
  handled_at      timestamptz,
  handled_by      uuid references public.profiles (id) on delete set null
);
create index support_requests_institution_idx on public.support_requests (institution_id, created_at desc);
alter table public.support_requests enable row level security;
create policy support_requests_insert on public.support_requests for insert to authenticated
  with check (
    created_by = auth.uid() and handled_at is null and handled_by is null
    and public.has_inst_role(institution_id, array['admin', 'registrar', 'dean', 'hod'])
    and (select count(*) from public.support_requests r
         where r.institution_id = support_requests.institution_id and r.created_at > now() - interval '1 day') < 30
  );
create policy support_requests_select on public.support_requests for select to authenticated
  using (public.is_platform_admin() or public.has_inst_role(institution_id, array['admin', 'registrar', 'dean', 'hod']));
create policy support_requests_update on public.support_requests for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select, insert, update on public.support_requests to authenticated;

revoke execute on function public.import_structure(uuid, jsonb) from public, anon;
grant execute on function public.import_structure(uuid, jsonb) to authenticated;

-- Removing a unit, department, programme, year, semester or teaching unit from the
-- console: refused while anything still hangs on it (people, courses, results...).
create or replace function public.remove_structure_item(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  used boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_kind = 'unit' then
    used := exists (select 1 from departments where faculty_id = p_id)
      or exists (select 1 from memberships where faculty_id = p_id)
      or exists (select 1 from invitations where faculty_id = p_id and accepted_at is null and revoked_at is null);
    if not used then delete from faculties where id = p_id; end if;
  elsif p_kind = 'department' then
    used := exists (select 1 from programmes where department_id = p_id)
      or exists (select 1 from courses where department_id = p_id)
      or exists (select 1 from memberships where department_id = p_id)
      or exists (select 1 from invitations where department_id = p_id and accepted_at is null and revoked_at is null);
    if not used then delete from departments where id = p_id; end if;
  elsif p_kind = 'programme' then
    used := exists (select 1 from teaching_units where programme_id = p_id)
      or exists (select 1 from programme_enrollments where programme_id = p_id)
      or exists (select 1 from deliberations where programme_id = p_id);
    if not used then delete from programmes where id = p_id; end if;
  elsif p_kind = 'year' then
    used := exists (select 1 from semesters where academic_year_id = p_id)
      or exists (select 1 from programme_enrollments where academic_year_id = p_id);
    if not used then delete from academic_years where id = p_id; end if;
  elsif p_kind = 'semester' then
    used := exists (select 1 from teaching_units where semester_id = p_id)
      or exists (select 1 from deliberations where semester_id = p_id);
    if not used then delete from semesters where id = p_id; end if;
  elsif p_kind = 'ue' then
    used := exists (select 1 from courses where teaching_unit_id = p_id)
      or exists (select 1 from jury_adjustments where teaching_unit_id = p_id);
    if not used then delete from teaching_units where id = p_id; end if;
  else
    raise exception 'invalid';
  end if;
  if used then
    raise exception 'in_use';
  end if;
end;
$$;
revoke execute on function public.remove_structure_item(text, uuid) from public, anon;
grant execute on function public.remove_structure_item(text, uuid) to authenticated;

-- The Ardoise team sees who sent a change request.
create or replace function public.can_see_profile(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select other = auth.uid()
  or public.is_platform_admin()
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
