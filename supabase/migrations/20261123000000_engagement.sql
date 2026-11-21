-- =====================================================================
-- Ardoise LMS — sprint 3: engagement
--   notifications, inbox, discussions, calendar & timetable, rubrics,
--   attendance with check-in codes, course files, syllabus
-- =====================================================================

-- Small helpers ---------------------------------------------------------
-- A path segment as a uuid, or null (storage paths are user-supplied).
create or replace function public.path_uuid(p text)
returns uuid language sql immutable set search_path = public as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end;
$$;

create or replace function public.course_code_of(p_course uuid)
returns text language sql stable security definer set search_path = public as $$
  select code from courses where id = p_course;
$$;

create or replace function public.display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), email) from profiles where id = p_user;
$$;

-- 1. Syllabus ------------------------------------------------------------
alter table public.courses add column syllabus text not null default '';

-- 2. Notifications --------------------------------------------------------
-- Text is rendered by the apps from kind + data, so each reader sees it in
-- their own language.
create table public.notifications (
  id              bigint generated always as identity primary key,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  course_id       uuid references public.courses (id) on delete cascade,
  kind            text not null check (kind in (
                    'announcement', 'assignment', 'grade', 'submission', 'message', 'discussion', 'results', 'attendance')),
  data            jsonb not null default '{}'::jsonb,
  link            text,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create or replace function public.notify_users(
  p_users uuid[], p_inst uuid, p_course uuid, p_kind text, p_data jsonb, p_link text
) returns void language sql security definer set search_path = public as $$
  insert into notifications (institution_id, user_id, course_id, kind, data, link)
  select p_inst, u, p_course, p_kind, p_data, p_link
  from (select distinct unnest(p_users) as u) x
  where u is not null and u is distinct from auth.uid();
$$;

create or replace function public.tg_notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_users(
    array(select e.user_id from enrollments e where e.course_id = new.course_id and e.user_id is distinct from new.author_id),
    new.institution_id, new.course_id, 'announcement',
    jsonb_build_object('course', course_code_of(new.course_id), 'title', new.title),
    '/courses/' || new.course_id || '/announcements');
  return null;
end;
$$;
create trigger notify_announcement after insert on public.announcements
  for each row execute function public.tg_notify_announcement();

create or replace function public.tg_notify_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform notify_users(
      array(select e.user_id from enrollments e where e.course_id = new.course_id and e.role = 'student'),
      new.institution_id, new.course_id, 'assignment',
      jsonb_build_object('course', course_code_of(new.course_id), 'title', new.title, 'due_at', new.due_at),
      '/courses/' || new.course_id || '/assignments/' || new.id);
  end if;
  return null;
end;
$$;
create trigger notify_assignment after insert or update of published on public.assignments
  for each row execute function public.tg_notify_assignment();

create or replace function public.tg_notify_grade()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  if new.score is not null and (tg_op = 'INSERT' or new.score is distinct from old.score) then
    select title, points_possible into a from assignments where id = new.assignment_id;
    perform notify_users(
      array[new.student_id], new.institution_id, new.course_id, 'grade',
      jsonb_build_object('course', course_code_of(new.course_id), 'title', a.title,
                         'score', new.score, 'points', a.points_possible),
      '/courses/' || new.course_id || '/assignments/' || new.assignment_id);
  end if;
  return null;
end;
$$;
create trigger notify_grade after insert or update of score on public.grades
  for each row execute function public.tg_notify_grade();

create or replace function public.tg_notify_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_users(
    array(select e.user_id from enrollments e where e.course_id = new.course_id and e.role in ('teacher', 'ta')),
    new.institution_id, new.course_id, 'submission',
    jsonb_build_object('course', course_code_of(new.course_id),
                       'title', (select title from assignments where id = new.assignment_id),
                       'student', display_name(new.student_id)),
    '/courses/' || new.course_id || '/assignments/' || new.assignment_id || '/grade?student=' || new.student_id);
  return null;
end;
$$;
create trigger notify_submission after insert on public.submissions
  for each row execute function public.tg_notify_submission();

create or replace function public.tg_notify_results()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform notify_users(
      array(select r.student_id from deliberation_results r where r.deliberation_id = new.id),
      new.institution_id, null, 'results',
      jsonb_build_object('programme', (select name from programmes where id = new.programme_id),
                         'semester', (select label from semesters where id = new.semester_id),
                         'level', new.level),
      '/results');
  end if;
  return null;
end;
$$;
create trigger notify_results after update of status on public.deliberations
  for each row execute function public.tg_notify_results();

-- 3. Calendar and timetable ----------------------------------------------
create table public.calendar_events (
  id                  uuid primary key default gen_random_uuid(),
  institution_id      uuid not null references public.institutions (id) on delete cascade,
  course_id           uuid references public.courses (id) on delete cascade,
  title               text not null check (length(trim(title)) > 0),
  description         text not null default '',
  location            text,
  kind                text not null default 'event' check (kind in ('class', 'exam', 'event', 'office_hours', 'holiday')),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  repeat_weekly_until date,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index calendar_events_course_idx on public.calendar_events (course_id, starts_at);
create index calendar_events_inst_idx on public.calendar_events (institution_id, starts_at);

create or replace function public.tg_scope_calendar_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
begin
  if new.course_id is not null then
    select institution_id into inst from courses where id = new.course_id;
    if inst is null then
      raise exception 'course_not_found';
    end if;
    new.institution_id := inst;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;
create trigger scope_calendar_events before insert or update on public.calendar_events
  for each row execute function public.tg_scope_calendar_event();

-- 4. Discussions ----------------------------------------------------------
create table public.discussion_topics (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  course_id         uuid not null references public.courses (id) on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  body              text not null default '',
  author_id         uuid references public.profiles (id) on delete set null,
  pinned            boolean not null default false,
  locked            boolean not null default false,
  reply_count       integer not null default 0,
  created_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now()
);
create index discussion_topics_course_idx on public.discussion_topics (course_id, pinned desc, last_activity_at desc);

create table public.discussion_replies (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  topic_id        uuid not null references public.discussion_topics (id) on delete cascade,
  parent_id       uuid references public.discussion_replies (id) on delete cascade,
  author_id       uuid references public.profiles (id) on delete set null,
  body            text not null check (length(trim(body)) > 0 and length(body) <= 20000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);
create index discussion_replies_topic_idx on public.discussion_replies (topic_id, created_at);

create or replace function public.tg_guard_topic()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
  staff boolean;
begin
  select institution_id into inst from courses where id = new.course_id;
  if inst is null then
    raise exception 'course_not_found';
  end if;
  new.institution_id := inst;
  staff := auth.uid() is null or public.is_course_staff(new.course_id);
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    new.reply_count := 0;
    new.last_activity_at := now();
    if not staff and (new.pinned or new.locked) then
      raise exception 'forbidden';
    end if;
  else
    if new.course_id is distinct from old.course_id or new.author_id is distinct from old.author_id then
      raise exception 'invalid';
    end if;
    if not staff and (new.pinned is distinct from old.pinned or new.locked is distinct from old.locked) then
      raise exception 'forbidden';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_discussion_topics before insert or update on public.discussion_topics
  for each row execute function public.tg_guard_topic();

create or replace function public.tg_scope_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tp record;
begin
  select id, course_id, institution_id, locked into tp from discussion_topics where id = new.topic_id;
  if tp.id is null then
    raise exception 'topic_not_found';
  end if;
  new.course_id := tp.course_id;
  new.institution_id := tp.institution_id;
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    if tp.locked and auth.uid() is not null and not public.is_course_staff(tp.course_id) then
      raise exception 'topic_locked';
    end if;
    if new.parent_id is not null and not exists (
      select 1 from discussion_replies r where r.id = new.parent_id and r.topic_id = new.topic_id
    ) then
      raise exception 'invalid';
    end if;
  else
    if new.topic_id is distinct from old.topic_id or new.author_id is distinct from old.author_id
       or new.parent_id is distinct from old.parent_id then
      raise exception 'invalid';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger scope_discussion_replies before insert or update on public.discussion_replies
  for each row execute function public.tg_scope_reply();

create or replace function public.tg_after_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tp record;
begin
  if tg_op = 'DELETE' then
    update discussion_topics set reply_count = greatest(reply_count - 1, 0) where id = old.topic_id;
    return null;
  end if;
  update discussion_topics set reply_count = reply_count + 1, last_activity_at = now()
  where id = new.topic_id
  returning title, author_id into tp;
  perform notify_users(
    array[tp.author_id, (select author_id from discussion_replies where id = new.parent_id)],
    new.institution_id, new.course_id, 'discussion',
    jsonb_build_object('course', course_code_of(new.course_id), 'title', tp.title,
                       'author', display_name(new.author_id)),
    '/courses/' || new.course_id || '/discussions/' || new.topic_id);
  return null;
end;
$$;
create trigger after_discussion_reply after insert or delete on public.discussion_replies
  for each row execute function public.tg_after_reply();

-- 5. Inbox ------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references public.institutions (id) on delete cascade,
  course_id        uuid references public.courses (id) on delete set null,
  subject          text not null default '',
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  institution_id   uuid not null references public.institutions (id) on delete cascade,
  last_read_at     timestamptz,
  archived         boolean not null default false,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  institution_id   uuid not null references public.institutions (id) on delete cascade,
  sender_id        uuid references public.profiles (id) on delete set null,
  body             text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.is_conversation_participant(p_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;

-- Who may write to whom: people who share a course, and the school office
-- (admins, registrars) with anyone in their institution, both ways.
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
        and (a.role in ('admin', 'registrar') or b.role in ('admin', 'registrar'))
    )
  );
$$;

create or replace function public.start_conversation(
  p_recipients uuid[], p_subject text, p_body text, p_course uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  recipients uuid[];
  r uuid;
  inst uuid;
  conv uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  select array_agg(distinct x) into recipients from unnest(p_recipients) x where x is not null and x <> me;
  if recipients is null or array_length(recipients, 1) > 50 then
    raise exception 'invalid';
  end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'invalid';
  end if;
  foreach r in array recipients loop
    if not public.can_message(r) then
      raise exception 'forbidden';
    end if;
  end loop;

  if p_course is not null then
    if not public.is_course_member(p_course) then
      raise exception 'forbidden';
    end if;
    select institution_id into inst from courses where id = p_course;
  else
    -- the institution every participant belongs to
    select m.institution_id into inst
    from memberships m
    where m.user_id = me
      and not exists (
        select 1 from unnest(recipients) x
        where not exists (select 1 from memberships m2 where m2.user_id = x and m2.institution_id = m.institution_id)
      )
    limit 1;
  end if;
  if inst is null then
    raise exception 'forbidden';
  end if;

  insert into conversations (institution_id, course_id, subject, created_by)
  values (inst, p_course, left(coalesce(btrim(p_subject), ''), 200), me)
  returning id into conv;
  insert into conversation_participants (conversation_id, user_id, institution_id, last_read_at)
  select conv, x, inst, case when x = me then now() end
  from unnest(recipients || me) x;
  insert into messages (conversation_id, institution_id, sender_id, body) values (conv, inst, me, p_body);
  return conv;
end;
$$;

-- People this user may write to, for the compose screen.
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
    select institution_id, bool_or(role in ('admin', 'registrar')) as is_office
    from memberships where user_id = auth.uid() group by institution_id
  ),
  office_people as (
    select distinct m.user_id
    from memberships m join my_inst i on i.institution_id = m.institution_id
    where m.user_id <> auth.uid() and (m.role in ('admin', 'registrar') or i.is_office)
  ),
  office_staff as (
    select distinct m.user_id
    from memberships m join my_inst i on i.institution_id = m.institution_id
    where m.role in ('admin', 'registrar')
  )
  select p.id, p.full_name, p.email,
         exists (select 1 from office_staff o where o.user_id = p.id) as office,
         coalesce(mt.courses, '') as courses
  from profiles p
  left join mates mt on mt.user_id = p.id
  where p.id in (select user_id from mates union select user_id from office_people)
  order by 4 desc, p.full_name;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update conversation_participants set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
$$;

create or replace function public.inbox_unread_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from conversation_participants p
  where p.user_id = auth.uid() and not p.archived
    and exists (
      select 1 from messages m
      where m.conversation_id = p.conversation_id
        and m.sender_id is distinct from auth.uid()
        and (p.last_read_at is null or m.created_at > p.last_read_at)
    );
$$;

create or replace function public.tg_scope_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select institution_id into new.institution_id from conversations where id = new.conversation_id;
  if new.institution_id is null then
    raise exception 'invalid';
  end if;
  new.sender_id := coalesce(auth.uid(), new.sender_id);
  new.created_at := now();
  return new;
end;
$$;
create trigger scope_messages before insert on public.messages
  for each row execute function public.tg_scope_message();

create or replace function public.tg_after_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  subj text;
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id
  returning subject into subj;
  update conversation_participants set last_read_at = new.created_at, archived = false
  where conversation_id = new.conversation_id and user_id = new.sender_id;
  update conversation_participants set archived = false
  where conversation_id = new.conversation_id;
  perform notify_users(
    array(select user_id from conversation_participants where conversation_id = new.conversation_id and user_id is distinct from new.sender_id),
    new.institution_id, null, 'message',
    jsonb_build_object('subject', subj, 'sender', display_name(new.sender_id), 'preview', left(new.body, 140)),
    '/inbox/' || new.conversation_id);
  return null;
end;
$$;
create trigger after_message after insert on public.messages
  for each row execute function public.tg_after_message();

-- 6. Rubrics ------------------------------------------------------------------
-- criteria: [{"id","title","description","levels":[{"id","title","points"}]}]
create table public.rubrics (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  criteria        jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array'),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create trigger scope_rubrics before insert or update on public.rubrics
  for each row execute function public.tg_scope_from_course();

alter table public.assignments add column rubric_id uuid references public.rubrics (id) on delete set null;

create or replace function public.tg_check_assignment_rubric()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rubric_id is not null and not exists (
    select 1 from rubrics r where r.id = new.rubric_id and r.course_id = new.course_id
  ) then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger check_assignment_rubric before insert or update of rubric_id on public.assignments
  for each row execute function public.tg_check_assignment_rubric();

create table public.rubric_assessments (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  rubric_id       uuid not null references public.rubrics (id) on delete cascade,
  ratings         jsonb not null default '{}'::jsonb,
  assessed_by     uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- Scores a rubric and writes the mark into the gradebook (scaled to the
-- assignment's points). ratings: {"<criterion id>": {"level": "<level id>", "comment": "..."}}
create or replace function public.save_rubric_assessment(
  p_assignment uuid, p_student uuid, p_ratings jsonb, p_comment text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  a record;
  rb record;
  crit jsonb;
  lvl jsonb;
  chosen text;
  earned numeric := 0;
  maxpts numeric := 0;
  crit_max numeric;
  cleaned jsonb := '{}'::jsonb;
  score numeric;
begin
  select id, course_id, institution_id, rubric_id, points_possible into a from assignments where id = p_assignment;
  if a.id is null or not public.is_course_staff(a.course_id) then
    raise exception 'forbidden';
  end if;
  if a.rubric_id is null or jsonb_typeof(p_ratings) <> 'object' then
    raise exception 'invalid';
  end if;
  if not exists (select 1 from enrollments where course_id = a.course_id and user_id = p_student and role = 'student') then
    raise exception 'invalid';
  end if;
  select * into rb from rubrics where id = a.rubric_id;

  for crit in select * from jsonb_array_elements(rb.criteria) loop
    select coalesce(max((l ->> 'points')::numeric), 0) into crit_max from jsonb_array_elements(crit -> 'levels') l;
    maxpts := maxpts + crit_max;
    chosen := p_ratings -> (crit ->> 'id') ->> 'level';
    if chosen is not null then
      select l into lvl from jsonb_array_elements(crit -> 'levels') l where l ->> 'id' = chosen;
      if lvl is null then
        raise exception 'invalid';
      end if;
      earned := earned + (lvl ->> 'points')::numeric;
      cleaned := cleaned || jsonb_build_object(crit ->> 'id', jsonb_build_object(
        'level', chosen,
        'points', (lvl ->> 'points')::numeric,
        'comment', left(coalesce(p_ratings -> (crit ->> 'id') ->> 'comment', ''), 2000)));
    end if;
  end loop;
  if maxpts <= 0 then
    raise exception 'invalid';
  end if;
  score := round(earned / maxpts * a.points_possible, 2);

  insert into rubric_assessments (institution_id, course_id, assignment_id, student_id, rubric_id, ratings, assessed_by, updated_at)
  values (a.institution_id, a.course_id, a.id, p_student, rb.id, cleaned, auth.uid(), now())
  on conflict (assignment_id, student_id)
  do update set ratings = excluded.ratings, rubric_id = excluded.rubric_id, assessed_by = excluded.assessed_by, updated_at = now();

  insert into grades (assignment_id, student_id, score, comment)
  values (a.id, p_student, score, nullif(btrim(coalesce(p_comment, '')), ''))
  on conflict (assignment_id, student_id)
  do update set score = excluded.score, comment = coalesce(excluded.comment, grades.comment);
  return score;
end;
$$;

-- 7. Attendance (l'appel) --------------------------------------------------
create table public.attendance_sessions (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  starts_at       timestamptz not null default now(),
  topic           text not null default '',
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index attendance_sessions_course_idx on public.attendance_sessions (course_id, starts_at desc);
create trigger scope_attendance_sessions before insert or update on public.attendance_sessions
  for each row execute function public.tg_scope_from_course();

-- Codes live apart from sessions so students can never read them.
create table public.attendance_codes (
  session_id      uuid primary key references public.attendance_sessions (id) on delete cascade,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  code            text not null check (code ~ '^[0-9]{6}$'),
  expires_at      timestamptz not null
);

create table public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  session_id      uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  status          text not null check (status in ('present', 'late', 'absent', 'excused')),
  method          text not null default 'teacher' check (method in ('teacher', 'code')),
  marked_by       uuid references public.profiles (id) on delete set null,
  marked_at       timestamptz not null default now(),
  unique (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id, course_id);

create table public.attendance_checkin_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  attempted_at  timestamptz not null default now(),
  ok            boolean not null
);
create index attendance_attempts_user_idx on public.attendance_checkin_attempts (user_id, attempted_at desc);

create or replace function public.tg_scope_attendance_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select course_id, institution_id into s from attendance_sessions where id = new.session_id;
  if s.course_id is null then
    raise exception 'invalid';
  end if;
  new.course_id := s.course_id;
  new.institution_id := s.institution_id;
  new.marked_at := now();
  if auth.uid() is not null and public.is_course_staff(s.course_id) then
    new.marked_by := auth.uid();
    new.method := 'teacher';
  end if;
  if not exists (select 1 from enrollments e where e.course_id = s.course_id and e.user_id = new.student_id and e.role = 'student') then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger scope_attendance_records before insert or update on public.attendance_records
  for each row execute function public.tg_scope_attendance_record();

create or replace function public.tg_scope_attendance_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select course_id, institution_id into new.course_id, new.institution_id from attendance_sessions where id = new.session_id;
  if new.course_id is null then
    raise exception 'invalid';
  end if;
  return new;
end;
$$;
create trigger scope_attendance_codes before insert or update on public.attendance_codes
  for each row execute function public.tg_scope_attendance_code();

-- Teacher shows a 6-digit code; it works for p_minutes.
create or replace function public.open_checkin(p_session uuid, p_minutes integer default 10)
returns text language plpgsql security definer set search_path = public as $$
declare
  s record;
  new_code text;
begin
  select id, course_id into s from attendance_sessions where id = p_session;
  if s.id is null or not public.is_course_staff(s.course_id) then
    raise exception 'forbidden';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 180 then
    raise exception 'invalid';
  end if;
  new_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
  insert into attendance_codes (session_id, institution_id, course_id, code, expires_at)
  values (s.id, null, s.course_id, new_code, now() + make_interval(mins => p_minutes))
  on conflict (session_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  return new_code;
end;
$$;

create or replace function public.close_checkin(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select id, course_id into s from attendance_sessions where id = p_session;
  if s.id is null or not public.is_course_staff(s.course_id) then
    raise exception 'forbidden';
  end if;
  delete from attendance_codes where session_id = p_session;
end;
$$;

-- Student enters the code. Returns {"status": "ok"|"invalid"|"too_many_attempts", ...};
-- it never raises on a wrong code, so failed attempts are recorded.
create or replace function public.check_in(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  failures integer;
  hit record;
  mark text;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  select count(*) into failures from attendance_checkin_attempts
  where user_id = me and not ok and attempted_at > now() - interval '15 minutes';
  if failures >= 8 then
    return jsonb_build_object('status', 'too_many_attempts');
  end if;

  select s.id, s.course_id, s.starts_at, c.title, c.code as course_code into hit
  from attendance_codes ac
  join attendance_sessions s on s.id = ac.session_id
  join courses c on c.id = s.course_id
  where ac.code = btrim(coalesce(p_code, '')) and ac.expires_at > now()
    and exists (select 1 from enrollments e where e.course_id = s.course_id and e.user_id = me and e.role = 'student')
  order by s.starts_at desc
  limit 1;

  if hit.id is null then
    insert into attendance_checkin_attempts (user_id, ok) values (me, false);
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into attendance_checkin_attempts (user_id, ok) values (me, true);

  mark := case when now() > hit.starts_at + interval '15 minutes' then 'late' else 'present' end;
  insert into attendance_records (session_id, student_id, status, method)
  values (hit.id, me, mark, 'code')
  on conflict (session_id, student_id) do update
    set status = excluded.status, method = 'code'
    where attendance_records.status = 'absent';
  return jsonb_build_object('status', 'ok', 'attendance', mark, 'course', hit.course_code, 'title', hit.title);
end;
$$;

-- 8. Course files ------------------------------------------------------------
create table public.course_files (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  folder          text not null default '',
  name            text not null check (length(trim(name)) > 0),
  storage_path    text not null unique,
  size_bytes      bigint not null default 0 check (size_bytes >= 0),
  mime_type       text,
  published       boolean not null default true,
  uploaded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index course_files_course_idx on public.course_files (course_id, folder, name);

create or replace function public.tg_scope_course_file()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select institution_id into new.institution_id from courses where id = new.course_id;
  if new.institution_id is null then
    raise exception 'course_not_found';
  end if;
  if public.path_uuid(split_part(new.storage_path, '/', 1)) is distinct from new.course_id then
    raise exception 'invalid';
  end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  end if;
  new.folder := btrim(new.folder);
  return new;
end;
$$;
create trigger scope_course_files before insert or update on public.course_files
  for each row execute function public.tg_scope_course_file();

insert into storage.buckets (id, name, public)
values ('course-files', 'course-files', false)
on conflict (id) do nothing;

create policy course_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'course-files' and public.is_course_staff(public.path_uuid((storage.foldername(name))[1])));
create policy course_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'course-files' and public.is_course_staff(public.path_uuid((storage.foldername(name))[1])));
create policy course_files_obj_select on storage.objects for select to authenticated
  using (
    bucket_id = 'course-files'
    and (
      public.is_course_staff(public.path_uuid((storage.foldername(name))[1]))
      or (
        public.is_course_member(public.path_uuid((storage.foldername(name))[1]))
        and exists (select 1 from public.course_files f where f.storage_path = storage.objects.name and f.published)
      )
    )
  );

-- 9. Row-level security -------------------------------------------------------
alter table public.notifications               enable row level security;
alter table public.calendar_events             enable row level security;
alter table public.discussion_topics           enable row level security;
alter table public.discussion_replies          enable row level security;
alter table public.conversations               enable row level security;
alter table public.conversation_participants   enable row level security;
alter table public.messages                    enable row level security;
alter table public.rubrics                     enable row level security;
alter table public.rubric_assessments          enable row level security;
alter table public.attendance_sessions         enable row level security;
alter table public.attendance_codes            enable row level security;
alter table public.attendance_records          enable row level security;
alter table public.attendance_checkin_attempts enable row level security;
alter table public.course_files                enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy calendar_events_select on public.calendar_events for select to authenticated
  using (
    (course_id is not null and public.is_course_member(course_id))
    or (course_id is null and public.is_inst_member(institution_id))
  );
create policy calendar_events_write on public.calendar_events for all to authenticated
  using (
    (course_id is not null and public.is_course_staff(course_id))
    or (course_id is null and public.has_inst_role(institution_id, array['admin', 'registrar']))
  )
  with check (
    (course_id is not null and public.is_course_staff(course_id))
    or (course_id is null and public.has_inst_role(institution_id, array['admin', 'registrar']))
  );

create policy discussion_topics_select on public.discussion_topics for select to authenticated
  using (public.is_course_member(course_id));
create policy discussion_topics_insert on public.discussion_topics for insert to authenticated
  with check (public.is_course_member(course_id) and author_id = auth.uid());
create policy discussion_topics_update on public.discussion_topics for update to authenticated
  using (author_id = auth.uid() or public.is_course_staff(course_id))
  with check (author_id = auth.uid() or public.is_course_staff(course_id));
create policy discussion_topics_delete on public.discussion_topics for delete to authenticated
  using (author_id = auth.uid() or public.is_course_staff(course_id));

create policy discussion_replies_select on public.discussion_replies for select to authenticated
  using (public.is_course_member(course_id));
create policy discussion_replies_insert on public.discussion_replies for insert to authenticated
  with check (public.is_course_member(course_id) and author_id = auth.uid());
create policy discussion_replies_update on public.discussion_replies for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy discussion_replies_delete on public.discussion_replies for delete to authenticated
  using (author_id = auth.uid() or public.is_course_staff(course_id));

create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_participant(id));
create policy conversation_participants_select on public.conversation_participants for select to authenticated
  using (public.is_conversation_participant(conversation_id));
create policy conversation_participants_update on public.conversation_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_conversation_participant(conversation_id) and sender_id = auth.uid());

create policy rubrics_select on public.rubrics for select to authenticated
  using (public.is_course_member(course_id));
create policy rubrics_write on public.rubrics for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));
create policy rubric_assessments_select on public.rubric_assessments for select to authenticated
  using (student_id = auth.uid() or public.is_course_staff(course_id));

create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using (public.is_course_member(course_id));
create policy attendance_sessions_write on public.attendance_sessions for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));
create policy attendance_codes_staff on public.attendance_codes for select to authenticated
  using (public.is_course_staff(course_id));
create policy attendance_records_select on public.attendance_records for select to authenticated
  using (student_id = auth.uid() or public.is_course_staff(course_id));
create policy attendance_records_write on public.attendance_records for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

create policy course_files_select on public.course_files for select to authenticated
  using (public.is_course_staff(course_id) or (published and public.is_course_member(course_id)));
create policy course_files_write on public.course_files for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- 10. Grants --------------------------------------------------------------------
-- Start from nothing, then open exactly what the apps use; everything else
-- goes through the functions above.
revoke all on
  public.notifications, public.calendar_events, public.discussion_topics, public.discussion_replies,
  public.conversations, public.conversation_participants, public.messages, public.rubrics,
  public.rubric_assessments, public.attendance_sessions, public.attendance_codes,
  public.attendance_records, public.attendance_checkin_attempts, public.course_files
from anon, authenticated;
grant select, insert, update, delete on
  public.calendar_events, public.discussion_topics, public.discussion_replies, public.rubrics,
  public.attendance_sessions, public.attendance_records, public.course_files
to authenticated;
grant select on public.conversations, public.messages, public.conversation_participants,
  public.rubric_assessments, public.attendance_codes, public.notifications to authenticated;
grant insert on public.messages to authenticated;
grant update (last_read_at, archived) on public.conversation_participants to authenticated;
grant update (read_at), delete on public.notifications to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant execute on function
  public.path_uuid(text),
  public.is_conversation_participant(uuid),
  public.can_message(uuid),
  public.start_conversation(uuid[], text, text, uuid),
  public.mark_conversation_read(uuid),
  public.message_contacts(),
  public.inbox_unread_count(),
  public.save_rubric_assessment(uuid, uuid, jsonb, text),
  public.open_checkin(uuid, integer),
  public.close_checkin(uuid),
  public.check_in(text)
to authenticated;

-- Internal helpers and trigger functions are not callable through the API.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prorettype = 'trigger'::regtype
           or p.proname in ('notify_users', 'course_code_of', 'display_name'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;
