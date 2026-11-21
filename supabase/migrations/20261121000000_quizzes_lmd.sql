-- =====================================================================
-- Ardoise LMS — sprint 2: quizzes and the LMD layer
--   * question banks, quizzes, timed attempts, auto-grading
--   * grading policy, programme enrollments, deliberations,
--     jury adjustments, transcripts with public verification
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Grades written by the quiz engine are not attributed to the student
-- ---------------------------------------------------------------------
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
    if auth.uid() is not null and public.is_course_staff(a_course) then
      new.graded_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tg_grade_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.score is distinct from old.score then
    insert into mark_audit_log (institution_id, course_id, assignment_id, student_id, old_score, new_score, changed_by)
    values (
      new.institution_id, new.course_id, new.assignment_id, new.student_id,
      case when tg_op = 'UPDATE' then old.score end,
      new.score,
      case when public.is_course_staff(new.course_id) then auth.uid() end
    );
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Question banks and questions (answer keys kept in a staff-only table)
-- ---------------------------------------------------------------------
create table public.question_banks (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  title           text not null,
  created_at      timestamptz not null default now()
);

create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  bank_id         uuid not null references public.question_banks (id) on delete cascade,
  qtype           text not null check (qtype in ('single', 'multiple', 'true_false', 'short', 'numeric', 'essay')),
  prompt          text not null check (length(trim(prompt)) > 0),
  -- [{"id":"a","text":"..."}] for single/multiple choice
  options         jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  points          numeric(6, 2) not null default 1 check (points > 0),
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index questions_bank_idx on public.questions (bank_id, position);

-- single: "a" · multiple: ["a","c"] · true_false: true · short: ["Yaoundé","yaounde"]
-- numeric: {"value": 3.14, "tolerance": 0.01} · essay: null (graded by hand)
create table public.question_keys (
  question_id     uuid primary key references public.questions (id) on delete cascade,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  correct         jsonb,
  explanation     text
);

create table public.quizzes (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references public.institutions (id) on delete cascade,
  course_id           uuid not null references public.courses (id) on delete cascade,
  assignment_id       uuid not null unique references public.assignments (id) on delete cascade,
  bank_id             uuid not null references public.question_banks (id) on delete restrict,
  question_count      integer check (question_count is null or question_count > 0),
  time_limit_minutes  integer check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  attempts_allowed    integer not null default 1 check (attempts_allowed between 1 and 10),
  shuffle_questions   boolean not null default true,
  shuffle_options     boolean not null default true,
  show_results        text not null default 'after_submit' check (show_results in ('never', 'after_submit', 'after_due')),
  created_at          timestamptz not null default now()
);

create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  quiz_id         uuid not null references public.quizzes (id) on delete cascade,
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  attempt_no      integer not null,
  question_ids    uuid[] not null,
  option_orders   jsonb not null default '{}'::jsonb,
  answers         jsonb not null default '{}'::jsonb,
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,
  last_saved_at   timestamptz,
  submitted_at    timestamptz,
  auto_points     jsonb not null default '{}'::jsonb,
  manual_points   jsonb not null default '{}'::jsonb,
  score           numeric(7, 2),
  max_score       numeric(7, 2) not null default 0,
  needs_review    boolean not null default false,
  unique (quiz_id, student_id, attempt_no)
);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, quiz_id);

-- Scoping triggers
create trigger scope_question_banks before insert or update on public.question_banks
  for each row execute function public.tg_scope_from_course();

create or replace function public.tg_scope_question()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  b record;
begin
  select qb.course_id, qb.institution_id into b from question_banks qb where qb.id = new.bank_id;
  if b.course_id is null then
    raise exception 'bank_not_found';
  end if;
  new.course_id := b.course_id;
  new.institution_id := b.institution_id;
  return new;
end;
$$;
create trigger scope_questions before insert or update on public.questions
  for each row execute function public.tg_scope_question();

-- Questions already drawn into an attempt stay, so past scores keep their meaning.
create or replace function public.tg_guard_question_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and exists (select 1 from quiz_attempts qa where old.id = any (qa.question_ids)) then
    raise exception 'question_in_use';
  end if;
  return old;
end;
$$;
create trigger guard_question_delete before delete on public.questions
  for each row execute function public.tg_guard_question_delete();

create or replace function public.tg_scope_question_key()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  q record;
begin
  select qs.course_id, qs.institution_id into q from questions qs where qs.id = new.question_id;
  if q.course_id is null then
    raise exception 'question_not_found';
  end if;
  new.course_id := q.course_id;
  new.institution_id := q.institution_id;
  return new;
end;
$$;
create trigger scope_question_keys before insert or update on public.question_keys
  for each row execute function public.tg_scope_question_key();

create or replace function public.tg_scope_quiz()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  select x.course_id, x.institution_id into a from assignments x where x.id = new.assignment_id;
  if a.course_id is null then
    raise exception 'assignment_not_found';
  end if;
  if not exists (select 1 from question_banks qb where qb.id = new.bank_id and qb.course_id = a.course_id) then
    raise exception 'bank_not_in_course';
  end if;
  new.course_id := a.course_id;
  new.institution_id := a.institution_id;
  return new;
end;
$$;
create trigger scope_quizzes before insert or update on public.quizzes
  for each row execute function public.tg_scope_quiz();

-- ---------------------------------------------------------------------
-- 2. Quiz engine (all student writes go through these functions)
-- ---------------------------------------------------------------------

-- True when an answer matches the key. Multiple choice is all-or-nothing.
create or replace function public.quiz_answer_correct(p_type text, p_correct jsonb, p_answer jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  given text;
  expected numeric;
  tolerance numeric;
begin
  if p_correct is null or p_answer is null or p_answer = 'null'::jsonb then
    return false;
  end if;
  if p_type = 'single' then
    return jsonb_typeof(p_answer) = 'string' and (p_answer #>> '{}') = (p_correct #>> '{}');
  elsif p_type = 'true_false' then
    return jsonb_typeof(p_answer) = 'boolean' and p_answer = p_correct;
  elsif p_type = 'multiple' then
    if jsonb_typeof(p_answer) <> 'array' or jsonb_typeof(p_correct) <> 'array' then
      return false;
    end if;
    return coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(p_answer) x), '{}')
         = coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(p_correct) x), '{}');
  elsif p_type = 'short' then
    given := lower(regexp_replace(btrim(p_answer #>> '{}'), '\s+', ' ', 'g'));
    return exists (
      select 1 from jsonb_array_elements_text(p_correct) c
      where lower(regexp_replace(btrim(c), '\s+', ' ', 'g')) = given
    );
  elsif p_type = 'numeric' then
    given := replace(btrim(p_answer #>> '{}'), ',', '.');
    if given !~ '^-?[0-9]+(\.[0-9]+)?$' then
      return false;
    end if;
    expected := (p_correct ->> 'value')::numeric;
    tolerance := coalesce((p_correct ->> 'tolerance')::numeric, 0);
    return abs(given::numeric - expected) <= tolerance;
  end if;
  return false;
end;
$$;

-- Writes the student's best quiz score (scaled to the assignment's points) into grades.
create or replace function public.sync_quiz_grade(p_quiz uuid, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  q record;
  pts numeric;
  best numeric;
begin
  select qz.assignment_id, a.points_possible into q
  from quizzes qz join assignments a on a.id = qz.assignment_id
  where qz.id = p_quiz;

  select max(round(qa.score / nullif(qa.max_score, 0) * q.points_possible, 2)) into best
  from quiz_attempts qa
  where qa.quiz_id = p_quiz and qa.student_id = p_student and qa.submitted_at is not null and qa.score is not null;

  if best is null then
    return;
  end if;

  insert into grades (assignment_id, student_id, score)
  values (q.assignment_id, p_student, best)
  on conflict (assignment_id, student_id) do update set score = excluded.score;
end;
$$;

create or replace function public.recompute_quiz_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  att record;
  total numeric := 0;
  review boolean := false;
  qq record;
begin
  select * into att from quiz_attempts where id = p_attempt;
  for qq in select qs.id, qs.qtype from questions qs where qs.id = any (att.question_ids) loop
    if att.manual_points ? qq.id::text then
      total := total + (att.manual_points ->> qq.id::text)::numeric;
    elsif qq.qtype = 'essay' then
      review := true;
    else
      total := total + coalesce((att.auto_points ->> qq.id::text)::numeric, 0);
    end if;
  end loop;
  update quiz_attempts set score = total, needs_review = review where id = p_attempt;
end;
$$;

create or replace function public.finalize_quiz_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  att record;
  auto jsonb := '{}'::jsonb;
  qq record;
  earned numeric;
begin
  select * into att from quiz_attempts where id = p_attempt for update;
  if att.id is null or att.submitted_at is not null then
    return;
  end if;
  for qq in
    select qs.id, qs.qtype, qs.points, k.correct
    from questions qs left join question_keys k on k.question_id = qs.id
    where qs.id = any (att.question_ids) and qs.qtype <> 'essay'
  loop
    earned := case when public.quiz_answer_correct(qq.qtype, qq.correct, att.answers -> qq.id::text) then qq.points else 0 end;
    auto := auto || jsonb_build_object(qq.id::text, earned);
  end loop;
  update quiz_attempts set submitted_at = now(), auto_points = auto where id = p_attempt;
  perform public.recompute_quiz_attempt(p_attempt);
  perform public.sync_quiz_grade(att.quiz_id, att.student_id);
end;
$$;

create or replace function public.start_quiz_attempt(p_quiz uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q record;
  open_attempt record;
  used integer;
  ids uuid[];
  orders jsonb := '{}'::jsonb;
  qq record;
  opts jsonb;
  total numeric;
  new_id uuid;
begin
  select qz.*, a.published into q from quizzes qz join assignments a on a.id = qz.assignment_id where qz.id = p_quiz;
  if q.id is null then
    raise exception 'quiz_not_found';
  end if;
  if public.course_role(q.course_id) is distinct from 'student' or not q.published then
    raise exception 'forbidden';
  end if;

  -- Resume the open attempt if time remains; close it if the clock ran out.
  select * into open_attempt from quiz_attempts
  where quiz_id = q.id and student_id = auth.uid() and submitted_at is null
  order by attempt_no desc limit 1;
  if open_attempt.id is not null then
    if open_attempt.deadline_at is null or open_attempt.deadline_at > now() then
      return open_attempt.id;
    end if;
    perform public.finalize_quiz_attempt(open_attempt.id);
  end if;

  select count(*) into used from quiz_attempts where quiz_id = q.id and student_id = auth.uid();
  if used >= q.attempts_allowed then
    raise exception 'no_attempts_left';
  end if;

  select array_agg(s.id order by case when q.shuffle_questions then s.r else 0 end, s.position, s.created_at)
  into ids
  from (
    select x.id, x.position, x.created_at, random() as r
    from questions x
    where x.bank_id = q.bank_id
    order by case when q.question_count is null then 0 else random() end
    limit coalesce(q.question_count, 2147483647)
  ) s;
  if ids is null then
    raise exception 'empty_quiz';
  end if;

  if q.shuffle_options then
    for qq in select x.id, x.options from questions x where x.id = any (ids) and x.qtype in ('single', 'multiple') loop
      select jsonb_agg(o ->> 'id' order by random()) into opts from jsonb_array_elements(qq.options) o;
      orders := orders || jsonb_build_object(qq.id::text, coalesce(opts, '[]'::jsonb));
    end loop;
  end if;

  select coalesce(sum(points), 0) into total from questions where id = any (ids);

  insert into quiz_attempts (
    institution_id, course_id, quiz_id, assignment_id, student_id, attempt_no,
    question_ids, option_orders, deadline_at, max_score
  ) values (
    q.institution_id, q.course_id, q.id, q.assignment_id, auth.uid(), used + 1,
    ids, orders,
    case when q.time_limit_minutes is not null then now() + make_interval(mins => q.time_limit_minutes) end,
    total
  ) returning id into new_id;
  return new_id;
end;
$$;

-- Autosave. A 30-second grace absorbs slow networks; after that the attempt closes itself.
-- Returns {"status":"saved","saved_at":...} or {"status":"time_up"} (the attempt is then submitted).
create or replace function public.save_quiz_answers(p_attempt uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  att record;
  cleaned jsonb;
begin
  select * into att from quiz_attempts where id = p_attempt for update;
  if att.id is null or att.student_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if att.submitted_at is not null then
    raise exception 'already_submitted';
  end if;
  if jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 200000 then
    raise exception 'invalid';
  end if;
  if att.deadline_at is not null and now() > att.deadline_at + interval '30 seconds' then
    perform public.finalize_quiz_attempt(p_attempt);
    return jsonb_build_object('status', 'time_up');
  end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into cleaned
  from jsonb_each(p_answers) e
  where e.key = any (att.question_ids::text[]);
  update quiz_attempts set answers = cleaned, last_saved_at = now() where id = p_attempt;
  return jsonb_build_object('status', 'saved', 'saved_at', now());
end;
$$;

create or replace function public.submit_quiz_attempt(p_attempt uuid, p_answers jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  att record;
begin
  select * into att from quiz_attempts where id = p_attempt;
  if att.id is null or att.student_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if att.submitted_at is not null then
    return;
  end if;
  if p_answers is not null and (att.deadline_at is null or now() <= att.deadline_at + interval '30 seconds') then
    perform public.save_quiz_answers(p_attempt, p_answers);
  end if;
  perform public.finalize_quiz_attempt(p_attempt);
end;
$$;

-- Teacher marks a question by hand (essays, or to override the automatic mark).
create or replace function public.grade_quiz_question(p_attempt uuid, p_question uuid, p_points numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  att record;
  max_pts numeric;
begin
  select * into att from quiz_attempts where id = p_attempt for update;
  if att.id is null or not public.is_course_staff(att.course_id) then
    raise exception 'forbidden';
  end if;
  if att.submitted_at is null then
    raise exception 'not_submitted';
  end if;
  if not (p_question = any (att.question_ids)) then
    raise exception 'invalid';
  end if;
  select points into max_pts from questions where id = p_question;
  if p_points is null then
    update quiz_attempts set manual_points = manual_points - p_question::text where id = p_attempt;
  else
    if p_points < 0 or p_points > max_pts then
      raise exception 'invalid';
    end if;
    update quiz_attempts set manual_points = manual_points || jsonb_build_object(p_question::text, p_points) where id = p_attempt;
  end if;
  perform public.recompute_quiz_attempt(p_attempt);
  perform public.sync_quiz_grade(att.quiz_id, att.student_id);
end;
$$;

-- Questions with the student's answers and, when the quiz allows it, the keys.
create or replace function public.quiz_attempt_review(p_attempt uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  att record;
  qz record;
  due timestamptz;
  staff boolean;
  show_keys boolean;
  result jsonb;
begin
  select * into att from quiz_attempts where id = p_attempt;
  if att.id is null then
    raise exception 'not_found';
  end if;
  staff := public.is_course_staff(att.course_id);
  if not staff and att.student_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  select * into qz from quizzes where id = att.quiz_id;
  select due_at into due from assignments where id = att.assignment_id;
  show_keys := staff or (
    att.submitted_at is not null and (
      qz.show_results = 'after_submit'
      or (qz.show_results = 'after_due' and due is not null and now() > due)
    )
  );

  select jsonb_build_object(
    'attempt_id', att.id,
    'submitted_at', att.submitted_at,
    'score', att.score,
    'max_score', att.max_score,
    'needs_review', att.needs_review,
    'show_keys', show_keys,
    'questions', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qs.id,
        'qtype', qs.qtype,
        'prompt', qs.prompt,
        'options', qs.options,
        'points', qs.points,
        'answer', att.answers -> qs.id::text,
        'earned', coalesce(att.manual_points -> qs.id::text, att.auto_points -> qs.id::text),
        'manual', att.manual_points ? qs.id::text,
        'correct', case when show_keys then k.correct end,
        'explanation', case when show_keys then k.explanation end
      ) order by array_position(att.question_ids, qs.id)
    ), '[]'::jsonb)
  ) into result
  from questions qs left join question_keys k on k.question_id = qs.id
  where qs.id = any (att.question_ids);
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. LMD: grading policy, course settings, programme enrollments
-- ---------------------------------------------------------------------
-- Defaults only: every value is set per institution from its own rules.
create table public.grading_policies (
  institution_id     uuid primary key references public.institutions (id) on delete cascade,
  pass_mark          numeric(4, 2) not null default 10 check (pass_mark between 0 and 20),
  ue_compensation    boolean not null default true,
  elimination_mark   numeric(4, 2) not null default 0 check (elimination_mark between 0 and 20),
  resit_rule         text not null default 'replace' check (resit_rule in ('replace', 'max')),
  component_weights  jsonb not null default '{"cc": 30, "tp": 20, "exam": 50}'::jsonb,
  jury_max_bonus     numeric(4, 2) not null default 1 check (jury_max_bonus between 0 and 5),
  updated_at         timestamptz not null default now()
);
insert into public.grading_policies (institution_id) select id from public.institutions on conflict do nothing;

create or replace function public.tg_default_grading_policy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into grading_policies (institution_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger default_grading_policy after insert on public.institutions
  for each row execute function public.tg_default_grading_policy();

alter table public.courses
  add column coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  add column component_weights jsonb check (component_weights is null or jsonb_typeof(component_weights) = 'object');

-- UE link, coefficient and weights decide official marks: only admins and the registrar change them.
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
create trigger guard_course_lmd before insert or update on public.courses
  for each row execute function public.tg_guard_course_lmd();

create table public.programme_enrollments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  programme_id      uuid not null references public.programmes (id) on delete cascade,
  academic_year_id  uuid not null references public.academic_years (id) on delete cascade,
  level             text not null,
  student_id        uuid not null references public.profiles (id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (programme_id, academic_year_id, student_id)
);

create or replace function public.tg_scope_programme_enrollment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
begin
  select p.institution_id into inst from programmes p where p.id = new.programme_id;
  if inst is null or not exists (select 1 from academic_years y where y.id = new.academic_year_id and y.institution_id = inst) then
    raise exception 'invalid';
  end if;
  new.institution_id := inst;
  return new;
end;
$$;
create trigger scope_programme_enrollments before insert or update on public.programme_enrollments
  for each row execute function public.tg_scope_programme_enrollment();

-- Registers students (by email) in a programme for a year; returns emails it could not find.
create or replace function public.register_students(p_programme uuid, p_year uuid, p_level text, p_emails text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
  e text;
  target uuid;
  added integer := 0;
  missing text[] := '{}';
begin
  select institution_id into inst from programmes where id = p_programme;
  if inst is null or not public.has_inst_role(inst, array['admin', 'registrar']) then
    raise exception 'forbidden';
  end if;
  if coalesce(btrim(p_level), '') = '' then
    raise exception 'invalid';
  end if;
  foreach e in array p_emails loop
    e := lower(btrim(e));
    continue when e = '';
    select id into target from profiles where lower(email) = e;
    if target is null then
      missing := missing || e;
      continue;
    end if;
    insert into memberships (institution_id, user_id, role) values (inst, target, 'student')
    on conflict do nothing;
    insert into programme_enrollments (programme_id, academic_year_id, level, student_id)
    values (p_programme, p_year, btrim(p_level), target)
    on conflict (programme_id, academic_year_id, student_id) do update set level = excluded.level;
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'not_found', to_jsonb(missing));
end;
$$;

-- Structure rows may only point at parents of the same institution.
create or replace function public.tg_check_same_institution()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Nested IFs: PL/pgSQL only resolves NEW's fields in the branch that runs.
  if tg_table_name = 'departments' then
    if new.faculty_id is not null
       and not exists (select 1 from faculties x where x.id = new.faculty_id and x.institution_id = new.institution_id) then
      raise exception 'invalid';
    end if;
  elsif tg_table_name = 'programmes' then
    if new.department_id is not null
       and not exists (select 1 from departments x where x.id = new.department_id and x.institution_id = new.institution_id) then
      raise exception 'invalid';
    end if;
  elsif tg_table_name = 'semesters' then
    if not exists (select 1 from academic_years x where x.id = new.academic_year_id and x.institution_id = new.institution_id) then
      raise exception 'invalid';
    end if;
  elsif tg_table_name = 'teaching_units' then
    if (new.programme_id is not null and not exists (select 1 from programmes x where x.id = new.programme_id and x.institution_id = new.institution_id))
       or (new.semester_id is not null and not exists (select 1 from semesters x where x.id = new.semester_id and x.institution_id = new.institution_id)) then
      raise exception 'invalid';
    end if;
  end if;
  return new;
end;
$$;
create trigger same_institution_departments before insert or update on public.departments
  for each row execute function public.tg_check_same_institution();
create trigger same_institution_programmes before insert or update on public.programmes
  for each row execute function public.tg_check_same_institution();
create trigger same_institution_semesters before insert or update on public.semesters
  for each row execute function public.tg_check_same_institution();
create trigger same_institution_teaching_units before insert or update on public.teaching_units
  for each row execute function public.tg_check_same_institution();

-- ---------------------------------------------------------------------
-- 4. Deliberations, jury adjustments, transcripts
-- ---------------------------------------------------------------------
create table public.deliberations (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  programme_id   uuid not null references public.programmes (id) on delete cascade,
  semester_id    uuid not null references public.semesters (id) on delete cascade,
  level          text not null,
  status         text not null default 'draft' check (status in ('draft', 'locked', 'published')),
  policy         jsonb,
  notes          text,
  computed_at    timestamptz,
  locked_at      timestamptz,
  locked_by      uuid references public.profiles (id) on delete set null,
  published_at   timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (programme_id, semester_id, level)
);

create table public.deliberation_results (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references public.institutions (id) on delete cascade,
  deliberation_id  uuid not null references public.deliberations (id) on delete cascade,
  student_id       uuid not null references public.profiles (id) on delete cascade,
  student_name     text not null default '',
  ue_results       jsonb not null default '[]'::jsonb,
  semester_average numeric(5, 2),
  credits_earned   integer not null default 0,
  credits_total    integer not null default 0,
  decision         text not null check (decision in ('admitted', 'admitted_compensation', 'resit', 'incomplete')),
  unique (deliberation_id, student_id)
);

create table public.jury_adjustments (
  id                bigint generated always as identity primary key,
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  deliberation_id   uuid not null references public.deliberations (id) on delete cascade,
  student_id        uuid not null references public.profiles (id) on delete cascade,
  teaching_unit_id  uuid not null references public.teaching_units (id) on delete cascade,
  bonus             numeric(4, 2) not null check (bonus >= 0),
  reason            text not null check (length(trim(reason)) > 2),
  adjusted_by       uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.transcripts (
  id                 uuid primary key default gen_random_uuid(),
  institution_id     uuid not null references public.institutions (id) on delete cascade,
  deliberation_id    uuid not null references public.deliberations (id) on delete cascade,
  student_id         uuid not null references public.profiles (id) on delete cascade,
  verification_code  text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  payload            jsonb not null,
  issued_by          uuid references public.profiles (id) on delete set null,
  issued_at          timestamptz not null default now(),
  unique (deliberation_id, student_id)
);

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
    -- draft -> locked -> published; only an admin can reopen a locked deliberation.
    if old.status = 'published' and new.status <> 'published' then
      raise exception 'deliberation_published';
    end if;
    if old.status = 'draft' and new.status = 'published' then
      raise exception 'must_lock_first';
    end if;
    if old.status = 'locked' and new.status = 'draft' and not public.has_inst_role(inst, array['admin']) then
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
create trigger scope_deliberations before insert or update on public.deliberations
  for each row execute function public.tg_scope_deliberation();

-- A locked or published deliberation is a record: it can't be deleted directly.
create or replace function public.tg_guard_deliberation_delete()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and pg_trigger_depth() = 1 then
    raise exception 'deliberation_locked';
  end if;
  return old;
end;
$$;
create trigger guard_deliberation_delete before delete on public.deliberations
  for each row execute function public.tg_guard_deliberation_delete();

-- Results and jury adjustments can only change while the deliberation is a draft.
create or replace function public.tg_guard_deliberation_child()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
  row_deliberation uuid;
begin
  row_deliberation := case when tg_op = 'DELETE' then old.deliberation_id else new.deliberation_id end;
  select id, institution_id, status, policy into d from deliberations where id = row_deliberation;
  if d.id is null then
    -- Parent already gone: this is a cascade from deleting a draft deliberation.
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'invalid';
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if d.status <> 'draft' then
    raise exception 'deliberation_locked';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.institution_id := d.institution_id;
  if tg_table_name = 'jury_adjustments' then
    new.adjusted_by := coalesce(auth.uid(), new.adjusted_by);
    if new.bonus > coalesce((select jury_max_bonus from grading_policies where institution_id = d.institution_id), 1) then
      raise exception 'bonus_too_high';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_deliberation_results before insert or update or delete on public.deliberation_results
  for each row execute function public.tg_guard_deliberation_child();
create trigger guard_jury_adjustments before insert or update or delete on public.jury_adjustments
  for each row execute function public.tg_guard_deliberation_child();

create or replace function public.tg_guard_transcript()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
begin
  select id, institution_id, status into d from deliberations where id = new.deliberation_id;
  if d.id is null or d.status <> 'published' then
    raise exception 'deliberation_not_published';
  end if;
  new.institution_id := d.institution_id;
  new.issued_by := coalesce(auth.uid(), new.issued_by);
  return new;
end;
$$;
create trigger guard_transcripts before insert on public.transcripts
  for each row execute function public.tg_guard_transcript();

-- Public verification of a transcript's QR code: only the facts printed on it.
create or replace function public.verify_transcript(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', t.verification_code,
    'issued_at', t.issued_at,
    'institution', i.name,
    'payload', t.payload
  )
  from transcripts t join institutions i on i.id = t.institution_id
  where t.verification_code = upper(btrim(p_code));
$$;

-- ---------------------------------------------------------------------
-- 5. Row-level security for the new tables
-- ---------------------------------------------------------------------
alter table public.question_banks        enable row level security;
alter table public.questions             enable row level security;
alter table public.question_keys         enable row level security;
alter table public.quizzes               enable row level security;
alter table public.quiz_attempts         enable row level security;
alter table public.grading_policies      enable row level security;
alter table public.programme_enrollments enable row level security;
alter table public.deliberations         enable row level security;
alter table public.deliberation_results  enable row level security;
alter table public.jury_adjustments      enable row level security;
alter table public.transcripts           enable row level security;

create policy question_banks_all on public.question_banks for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy questions_select on public.questions for select to authenticated
  using (
    public.is_course_staff(course_id)
    or exists (
      select 1 from public.quiz_attempts qa
      where qa.student_id = auth.uid() and questions.id = any (qa.question_ids)
    )
  );
create policy questions_write on public.questions for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy question_keys_all on public.question_keys for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy quizzes_select on public.quizzes for select to authenticated
  using (public.is_course_member(course_id));
create policy quizzes_write on public.quizzes for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- Attempts are written only by the quiz functions above.
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (student_id = auth.uid() or public.is_course_staff(course_id));

create policy grading_policies_select on public.grading_policies for select to authenticated
  using (public.is_inst_member(institution_id));
create policy grading_policies_write on public.grading_policies for update to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar']))
  with check (public.has_inst_role(institution_id, array['admin', 'registrar']));

create policy programme_enrollments_select on public.programme_enrollments for select to authenticated
  using (student_id = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar']));
create policy programme_enrollments_write on public.programme_enrollments for all to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar']))
  with check (public.has_inst_role(institution_id, array['admin', 'registrar']));

create policy deliberations_select on public.deliberations for select to authenticated
  using (
    public.has_inst_role(institution_id, array['admin', 'registrar'])
    or (status = 'published' and exists (
      select 1 from public.deliberation_results r where r.deliberation_id = deliberations.id and r.student_id = auth.uid()
    ))
  );
create policy deliberations_write on public.deliberations for all to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar']))
  with check (public.has_inst_role(institution_id, array['admin', 'registrar']));

create or replace function public.deliberation_published(p_deliberation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from deliberations d where d.id = p_deliberation and d.status = 'published');
$$;

create policy deliberation_results_select on public.deliberation_results for select to authenticated
  using (
    public.has_inst_role(institution_id, array['admin', 'registrar'])
    or (student_id = auth.uid() and public.deliberation_published(deliberation_id))
  );
create policy deliberation_results_write on public.deliberation_results for all to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar']))
  with check (public.has_inst_role(institution_id, array['admin', 'registrar']));

create policy jury_adjustments_all on public.jury_adjustments for all to authenticated
  using (public.has_inst_role(institution_id, array['admin', 'registrar']))
  with check (public.has_inst_role(institution_id, array['admin', 'registrar']));

create policy transcripts_select on public.transcripts for select to authenticated
  using (student_id = auth.uid() or public.has_inst_role(institution_id, array['admin', 'registrar']));
create policy transcripts_insert on public.transcripts for insert to authenticated
  with check (public.has_inst_role(institution_id, array['admin', 'registrar']));

-- ---------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.question_banks, public.questions, public.question_keys, public.quizzes, public.quiz_attempts,
  public.grading_policies, public.programme_enrollments, public.deliberations, public.deliberation_results,
  public.jury_adjustments, public.transcripts
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on function
  public.finalize_quiz_attempt(uuid),
  public.recompute_quiz_attempt(uuid),
  public.sync_quiz_grade(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.start_quiz_attempt(uuid),
  public.save_quiz_answers(uuid, jsonb),
  public.submit_quiz_attempt(uuid, jsonb),
  public.grade_quiz_question(uuid, uuid, numeric),
  public.quiz_attempt_review(uuid),
  public.register_students(uuid, uuid, text, text[]),
  public.deliberation_published(uuid)
to authenticated;

grant execute on function public.verify_transcript(text) to anon, authenticated;
