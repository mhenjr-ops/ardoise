-- Draft transcript. Any student can download a provisional transcript of the year they are
-- registered in: for each semester, the official published result if the jury has published
-- one, otherwise what their marks so far add up to. The website computes it with the same
-- LMD engine as the deliberation; this function only hands over the inputs, for the caller
-- alone: the structure (UEs, courses, published assignments), the grading policy and their
-- own marks. No jury bonus from an unpublished deliberation is included.

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
    'institution', (select jsonb_build_object('name', i.name, 'short_name', i.short_name)
                    from institutions i where i.id = pe.institution_id),
    'student', (select jsonb_build_object(
                  'full_name', p.full_name,
                  'email', p.email,
                  'matricule', (select r.matricule from student_roster r
                                where r.institution_id = pe.institution_id and r.claimed_by = me limit 1))
                from profiles p where p.id = me),
    'programme', (select jsonb_build_object('name', pr.name, 'code', pr.code) from programmes pr where pr.id = pe.programme_id),
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

revoke execute on function public.draft_transcript_data() from public, anon;
grant execute on function public.draft_transcript_data() to authenticated;
