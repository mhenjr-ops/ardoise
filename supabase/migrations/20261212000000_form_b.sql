-- Form B and per-course transcripts.
--
-- 1. Form B. At the University of Bamenda a student's courses for the year are on their
--    Form B, printed from the registration portal. The student uploads it; the app reads its
--    text (on the server), and the database checks it: the student's own matricule must be
--    on it, the academic year (if it names one) must be this year's, and the same file can't
--    serve two accounts. Its course codes, matched against the catalogue, become the
--    student's registrations for the year: they join the courses already open and the others
--    as soon as a lecturer opens them. Courses they were only added to automatically and that
--    aren't on the form are dropped, since the form is their actual registration.
--
-- 2. A draft transcript for universities that grade course by course (no teaching units):
--    a semester whose programme has no teaching units lists the courses the student is in,
--    each with its catalogue credits.

-- 1. Form B ------------------------------------------------------------------------------

create table public.form_b_uploads (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  student_id        uuid not null references public.profiles (id) on delete cascade,
  academic_year_id  uuid references public.academic_years (id) on delete set null,
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  codes             text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- One file, one account.
create unique index form_b_uploads_file_key on public.form_b_uploads (institution_id, sha256);
create index form_b_uploads_student_idx on public.form_b_uploads (student_id);

alter table public.form_b_uploads enable row level security;
create policy form_b_uploads_select on public.form_b_uploads for select to authenticated
  using (student_id = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar']));
create policy two_step on public.form_b_uploads as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select on public.form_b_uploads to authenticated;

-- What a Form B's text says, for the signed-in student: is their matricule on it, which
-- academic year it names, and which of its course codes are in the catalogue.
create or replace function public.form_b_read(p_text text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  body text := left(coalesce(p_text, ''), 200000);
  flat text;
  r record;
  sem uuid;
  yr record;
  want text;
  years text[];
  cand text[];
  found_codes text[];
begin
  if me is null or not public.mfa_ok() then
    raise exception 'forbidden';
  end if;
  select sr.id, sr.institution_id, sr.matricule into r
  from student_roster sr where sr.claimed_by = me
  order by sr.claimed_at desc nulls last limit 1;
  if r.id is null then
    raise exception 'no_matricule';
  end if;
  flat := upper(regexp_replace(body, '[[:space:]./_-]', '', 'g'));

  sem := public.current_semester(r.institution_id);
  select y.id, y.label into yr from academic_years y join semesters s on s.academic_year_id = y.id where s.id = sem;
  want := (select m[1] || '-' || m[2] from regexp_matches(coalesce(yr.label, ''), '(20[0-9]{2})[^0-9]+(20[0-9]{2})') m limit 1);
  years := array(select distinct m[1] || '-' || m[2]
                 from regexp_matches(body, '(20[0-9]{2})[[:space:]]*[/–-][[:space:]]*(20[0-9]{2})', 'g') m);

  -- Course codes as written on the form ("CVLE 2101", "CVLE-2101", "CVLE2101").
  cand := array(select distinct m[1] || m[2]
                from regexp_matches(upper(body), '\m([A-Z]{2,6})[[:space:]]?-?[[:space:]]?([0-9]{3,4}[A-Z]?)\M', 'g') m);
  found_codes := array(select cc.code from catalogue_courses cc
                       where cc.institution_id = r.institution_id and cc.retired_at is null and cc.code = any (cand));

  return jsonb_build_object(
    'roster_id', r.id,
    'institution_id', r.institution_id,
    'matricule', r.matricule,
    'matricule_ok', position(upper(regexp_replace(r.matricule, '[[:space:]./_-]', '', 'g')) in flat) > 0,
    'academic_year_id', yr.id,
    'academic_year', yr.label,
    'years_seen', to_jsonb(years),
    'year_ok', case when cardinality(years) = 0 or want is null then null else want = any (years) end,
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'catalogue_id', x.id, 'code', x.code, 'title', x.title, 'credits', x.credits,
               'semester_no', x.semester_no, 'semester_id', x.sem_id, 'semester', x.sem_label,
               'course_id', x.course_id,
               'status', case when x.course_id is null then 'waiting'
                              when exists (select 1 from enrollments e where e.course_id = x.course_id and e.user_id = me) then 'in'
                              else 'joins' end)
             order by x.sem_order, x.code)
      from (
        select cc.id, cc.code, cc.title, cc.credits, cc.semester_no, s.id as sem_id, s.label as sem_label,
               coalesce(s.starts_on, '9999-12-31') as sem_order,
               (select co.id from courses co where co.institution_id = r.institution_id and co.semester_id = s.id
                  and (co.catalogue_id = cc.id or upper(co.code) = cc.code) order by co.created_at limit 1) as course_id
        from catalogue_courses cc
        join semesters s on s.id = public.catalogue_semester(r.institution_id, cc.semester_no)
        where cc.institution_id = r.institution_id and cc.code = any (found_codes)
      ) x), '[]'::jsonb),
    'unknown', to_jsonb(array(select c from unnest(cand) c where not (c = any (found_codes)) order by c limit 30))
  );
end;
$$;

-- The preview the student sees before registering.
create or replace function public.form_b_check(p_sha256 text, p_text text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  x jsonb := public.form_b_read(p_text);
begin
  return x || jsonb_build_object('used_by_other', exists (
    select 1 from form_b_uploads f
    where f.institution_id = (x ->> 'institution_id')::uuid and f.sha256 = lower(coalesce(p_sha256, ''))
      and f.student_id <> auth.uid()));
end;
$$;

-- Registers the student's courses for the year from their Form B.
create or replace function public.form_b_apply(p_sha256 text, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  x jsonb := public.form_b_read(p_text);
  inst uuid := (x ->> 'institution_id')::uuid;
  roster uuid := (x ->> 'roster_id')::uuid;
  yr uuid := (x ->> 'academic_year_id')::uuid;
  sha text := lower(coalesce(p_sha256, ''));
  joined int;
  removed int;
  waiting int;
  open_ids uuid[];
begin
  if sha !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid';
  end if;
  if not (x ->> 'matricule_ok')::boolean then
    raise exception 'form_b_not_yours';
  end if;
  if (x ->> 'year_ok')::boolean is false then
    raise exception 'form_b_wrong_year';
  end if;
  if jsonb_array_length(x -> 'courses') = 0 then
    raise exception 'form_b_no_courses';
  end if;
  if exists (select 1 from form_b_uploads f where f.institution_id = inst and f.sha256 = sha and f.student_id <> me) then
    raise exception 'form_b_used';
  end if;

  -- The form is the year's registration: it replaces what was registered before.
  delete from roster_courses rc
  where rc.roster_id = roster and rc.semester_id in (select id from semesters where academic_year_id = yr);
  insert into roster_courses (roster_id, institution_id, course_code, semester_id)
  select roster, inst, c ->> 'code', (c ->> 'semester_id')::uuid from jsonb_array_elements(x -> 'courses') c
  on conflict do nothing;

  open_ids := array(select (c ->> 'course_id')::uuid from jsonb_array_elements(x -> 'courses') c where c ->> 'course_id' is not null);
  insert into enrollments (institution_id, course_id, user_id, role)
  select inst, id, me, 'student' from unnest(open_ids) id
  on conflict (course_id, user_id) do update set added_by = null
    where enrollments.role = 'student' and enrollments.added_by is not null;
  get diagnostics joined = row_count;

  delete from enrollments e using courses c
  where e.course_id = c.id and e.user_id = me and e.role = 'student' and e.added_by = 'auto'
    and c.semester_id in (select id from semesters where academic_year_id = yr)
    and not (c.id = any (open_ids));
  get diagnostics removed = row_count;
  waiting := (select count(*) from jsonb_array_elements(x -> 'courses') c where c ->> 'course_id' is null);

  insert into form_b_uploads (institution_id, student_id, academic_year_id, sha256, codes)
  values (inst, me, yr, sha, array(select c ->> 'code' from jsonb_array_elements(x -> 'courses') c))
  on conflict (institution_id, sha256) do update set codes = excluded.codes, academic_year_id = excluded.academic_year_id, updated_at = now()
    where form_b_uploads.student_id = me;

  return jsonb_build_object('registered', jsonb_array_length(x -> 'courses'), 'joined', joined,
                            'waiting', waiting, 'removed', removed);
end;
$$;

-- 2. Course-by-course draft transcripts ---------------------------------------------------

create or replace function public.draft_transcript_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pe record;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if not public.mfa_ok() then
    raise exception 'mfa_required';
  end if;

  -- The registration of the current year (else the most recent one).
  select e.institution_id, e.programme_id, e.academic_year_id, e.level, y.label as year_label
    into pe
  from programme_enrollments e
  join academic_years y on y.id = e.academic_year_id
  where e.student_id = me
  order by y.is_current desc, y.starts_on desc nulls last, e.created_at desc
  limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'institution', (select jsonb_build_object('name', i.name, 'short_name', i.short_name, 'template', i.transcript_template)
                    from institutions i where i.id = pe.institution_id),
    'student', (select jsonb_build_object(
                  'full_name', p.full_name,
                  'email', p.email,
                  'matricule', (select r.matricule from student_roster r
                                where r.institution_id = pe.institution_id and r.claimed_by = me limit 1))
                from profiles p where p.id = me),
    'programme', (select jsonb_build_object('name', pr.name, 'code', pr.code, 'department', dp.name, 'faculty', fa.name)
                  from programmes pr
                  left join departments dp on dp.id = pr.department_id
                  left join faculties fa on fa.id = dp.faculty_id
                  where pr.id = pe.programme_id),
    'level', pe.level,
    'academic_year', pe.year_label,
    'policy', (select to_jsonb(gp) - 'institution_id' - 'updated_at' from grading_policies gp
               where gp.institution_id = pe.institution_id),
    'semesters', coalesce((
      select jsonb_agg(x.sem order by x.starts_on nulls last, x.label)
      from (
        select s.label, s.starts_on, jsonb_build_object(
          'id', s.id,
          'label', s.label,
          'published', (
            select jsonb_build_object(
              'ue_results', dr.ue_results, 'semester_average', dr.semester_average,
              'credits_earned', dr.credits_earned, 'credits_total', dr.credits_total,
              'decision', dr.decision, 'published_at', d.published_at)
            from deliberations d
            join deliberation_results dr on dr.deliberation_id = d.id and dr.student_id = me
            where d.programme_id = pe.programme_id and d.semester_id = s.id and d.level = pe.level
              and d.status = 'published'
            limit 1),
          'ues', case when m.has_ues then (
            select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'code', u.code, 'title', u.title, 'credits', u.credits)
                                      order by u.code), '[]'::jsonb)
            from teaching_units u
            where u.programme_id = pe.programme_id and u.semester_id = s.id and (u.level is null or u.level = pe.level))
          else (
            -- One line per course the student is in, with the catalogue's credits.
            select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title,
                                                         'credits', coalesce(cc.credits, 0)) order by c.code), '[]'::jsonb)
            from courses c
            join enrollments e on e.course_id = c.id and e.user_id = me and e.role = 'student'
            left join catalogue_courses cc on cc.id = c.catalogue_id
            where c.semester_id = s.id)
          end,
          'courses', case when m.has_ues then (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'id', c.id, 'code', c.code, 'title', c.title, 'teaching_unit_id', c.teaching_unit_id,
                     'coefficient', c.coefficient, 'component_weights', c.component_weights) order by c.code), '[]'::jsonb)
            from courses c
            join teaching_units u on u.id = c.teaching_unit_id
            where u.programme_id = pe.programme_id and u.semester_id = s.id and (u.level is null or u.level = pe.level))
          else (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'id', c.id, 'code', c.code, 'title', c.title, 'teaching_unit_id', c.id,
                     'coefficient', 1, 'component_weights', c.component_weights) order by c.code), '[]'::jsonb)
            from courses c
            join enrollments e on e.course_id = c.id and e.user_id = me and e.role = 'student'
            where c.semester_id = s.id)
          end,
          'assignments', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'id', a.id, 'course_id', a.course_id, 'component', a.component,
                     'weight', a.weight, 'points_possible', a.points_possible)), '[]'::jsonb)
            from assignments a
            where a.published and a.course_id in (select t.id from public.transcript_course_ids(me, pe.programme_id, pe.level, s.id, m.has_ues) t)),
          'grades', (
            select coalesce(jsonb_agg(jsonb_build_object('assignment_id', g.assignment_id, 'score', g.score)), '[]'::jsonb)
            from grades g
            join assignments a on a.id = g.assignment_id and a.published
            where g.student_id = me
              and a.course_id in (select t.id from public.transcript_course_ids(me, pe.programme_id, pe.level, s.id, m.has_ues) t))
        ) as sem
        from semesters s
        cross join lateral (
          select exists (select 1 from teaching_units u
                         where u.programme_id = pe.programme_id and u.semester_id = s.id
                           and (u.level is null or u.level = pe.level)) as has_ues
        ) m
        where s.academic_year_id = pe.academic_year_id
          and (m.has_ues or exists (select 1 from enrollments e join courses c on c.id = e.course_id
                                    where e.user_id = me and e.role = 'student' and c.semester_id = s.id))
      ) x), '[]'::jsonb)
  );
end;
$$;

-- The courses that make up one semester of a student's transcript.
create or replace function public.transcript_course_ids(p_student uuid, p_programme uuid, p_level text, p_semester uuid, p_has_ues boolean)
returns table (id uuid) language sql stable security definer set search_path = public as $$
  select c.id from courses c
  join teaching_units u on u.id = c.teaching_unit_id
  where p_has_ues and u.programme_id = p_programme and u.semester_id = p_semester and (u.level is null or u.level = p_level)
  union
  select c.id from courses c
  join enrollments e on e.course_id = c.id and e.user_id = p_student and e.role = 'student'
  where not p_has_ues and c.semester_id = p_semester
$$;

revoke execute on function public.form_b_read(text), public.transcript_course_ids(uuid, uuid, text, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.form_b_check(text, text), public.form_b_apply(text, text) from public, anon;
grant execute on function public.form_b_check(text, text), public.form_b_apply(text, text) to authenticated;
