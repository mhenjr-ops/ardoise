-- Transcript templates. Each university's transcripts can follow its own official layout
-- (the University of Bamenda's: bilingual letterhead, marks /100, letter grades and GPA on 4).
-- The layout is chosen per university by the Ardoise team only, since it shapes documents
-- that carry the university's name. The draft transcript data now says which layout to use,
-- plus the programme's department and faculty for the letterhead.

alter table public.institutions
  add column transcript_template text not null default 'standard' check (transcript_template in ('standard', 'uba'));

update public.institutions set transcript_template = 'uba' where slug = 'uba';

create or replace function public.tg_institution_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin()
     and coalesce(current_setting('ardoise.review_confirm', true), '') <> 'on'
     and (new.status is distinct from old.status
          or new.structure_confirmed_at is distinct from old.structure_confirmed_at
          or new.structure_source is distinct from old.structure_source) then
    raise exception 'forbidden';
  end if;
  if new.transcript_template is distinct from old.transcript_template
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;

create or replace function public.set_transcript_template(p_institution uuid, p_template text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_template not in ('standard', 'uba') then
    raise exception 'invalid';
  end if;
  update institutions set transcript_template = p_template where id = p_institution;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

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
          'ues', (
            select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'code', u.code, 'title', u.title, 'credits', u.credits)
                                      order by u.code), '[]'::jsonb)
            from teaching_units u
            where u.programme_id = pe.programme_id and u.semester_id = s.id and (u.level is null or u.level = pe.level)),
          'courses', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'id', c.id, 'code', c.code, 'title', c.title, 'teaching_unit_id', c.teaching_unit_id,
                     'coefficient', c.coefficient, 'component_weights', c.component_weights) order by c.code), '[]'::jsonb)
            from courses c
            join teaching_units u on u.id = c.teaching_unit_id
            where u.programme_id = pe.programme_id and u.semester_id = s.id and (u.level is null or u.level = pe.level)),
          'assignments', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'id', a.id, 'course_id', a.course_id, 'component', a.component,
                     'weight', a.weight, 'points_possible', a.points_possible)), '[]'::jsonb)
            from assignments a
            join courses c on c.id = a.course_id
            join teaching_units u on u.id = c.teaching_unit_id
            where a.published
              and u.programme_id = pe.programme_id and u.semester_id = s.id and (u.level is null or u.level = pe.level)),
          'grades', (
            select coalesce(jsonb_agg(jsonb_build_object('assignment_id', g.assignment_id, 'score', g.score)), '[]'::jsonb)
            from grades g
            join assignments a on a.id = g.assignment_id and a.published
            join courses c on c.id = a.course_id
            join teaching_units u on u.id = c.teaching_unit_id
            where g.student_id = me
              and u.programme_id = pe.programme_id and u.semester_id = s.id and (u.level is null or u.level = pe.level))
        ) as sem
        from semesters s
        where s.academic_year_id = pe.academic_year_id
          and exists (select 1 from teaching_units u
                      where u.programme_id = pe.programme_id and u.semester_id = s.id
                        and (u.level is null or u.level = pe.level))
      ) x), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.set_transcript_template(uuid, text) from public, anon;
grant execute on function public.set_transcript_template(uuid, text) to authenticated;
