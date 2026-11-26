-- A link the Ardoise team sends to a university so its registrar can check the structure
-- without an account: tick what is wrong, add what is missing, or confirm it as correct.
-- Confirming marks the structure checked; corrections come back to the team in the console.

create table public.structure_reviews (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  token           text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '60 days',
  opened_at       timestamptz,
  revoked_at      timestamptz
);
create index structure_reviews_institution_idx on public.structure_reviews (institution_id, created_at desc);

create table public.structure_review_answers (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references public.structure_reviews (id) on delete cascade,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  verdict         text not null check (verdict in ('confirmed', 'changes')),
  reviewer_name   text not null check (length(trim(reviewer_name)) between 2 and 200),
  reviewer_title  text not null default '' check (length(reviewer_title) <= 200),
  -- What was marked wrong, as it was named then: [{kind, name, parent}]
  flagged         jsonb not null default '[]'::jsonb,
  -- What is missing, per faculty or school: [{unit, text}]
  missing         jsonb not null default '[]'::jsonb,
  notes           text not null default '' check (length(notes) <= 5000),
  created_at      timestamptz not null default now(),
  handled_at      timestamptz,
  handled_by      uuid references public.profiles (id) on delete set null
);
create index structure_review_answers_institution_idx on public.structure_review_answers (institution_id, created_at desc);

alter table public.structure_reviews enable row level security;
alter table public.structure_review_answers enable row level security;
create policy structure_reviews_team on public.structure_reviews for select to authenticated
  using (public.is_platform_admin());
create policy structure_review_answers_team on public.structure_review_answers for select to authenticated
  using (public.is_platform_admin());
create policy structure_review_answers_handle on public.structure_review_answers for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy two_step on public.structure_reviews as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy two_step on public.structure_review_answers as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select on public.structure_reviews to authenticated;
grant select, update (handled_at, handled_by) on public.structure_review_answers to authenticated;

-- A confirmation through a review link is allowed to mark the structure checked, whoever is
-- signed in on that browser; every other change of status stays with the Ardoise team.
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
  return new;
end;
$$;

create or replace function public.create_structure_review(p_institution uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  tok text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from institutions where id = p_institution) then
    raise exception 'invalid';
  end if;
  insert into structure_reviews (institution_id, created_by) values (p_institution, auth.uid()) returning token into tok;
  return tok;
end;
$$;

create or replace function public.revoke_structure_review(p_review uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  update structure_reviews set revoked_at = now() where id = p_review and revoked_at is null;
end;
$$;

-- What the review page shows: the university, its look and its whole structure. The token is the secret.
create or replace function public.structure_review_open(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  i record;
  state text;
begin
  select * into r from structure_reviews where token = p_token;
  if r.id is null then
    return null;
  end if;
  select * into i from institutions where id = r.institution_id;
  state := case when r.revoked_at is not null then 'revoked' when r.expires_at < now() then 'expired' else 'open' end;
  if state = 'open' and r.opened_at is null then
    update structure_reviews set opened_at = now() where id = r.id;
  end if;
  return jsonb_build_object(
    'status', state,
    'institution', i.name,
    'short_name', i.short_name,
    'brand_color', i.brand_color,
    'logo_path', i.logo_path,
    'locale', i.default_locale,
    'confirmed_at', i.structure_confirmed_at,
    'units', case when state <> 'open' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'code', f.code, 'kind', f.kind,
        'departments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', d.id, 'name', d.name,
            'programmes', coalesce((
              select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'cycle', p.cycle) order by p.name)
              from programmes p where p.department_id = d.id), '[]'::jsonb))
            order by d.name)
          from departments d where d.faculty_id = f.id), '[]'::jsonb))
        order by f.kind, f.name)
      from faculties f where f.institution_id = i.id), '[]'::jsonb) end);
end;
$$;

-- The registrar's answer. Anything ticked or missing makes it a correction, never a confirmation.
create or replace function public.structure_review_answer(
  p_token text, p_name text, p_title text, p_confirm boolean,
  p_flagged uuid[] default '{}', p_missing jsonb default '[]'::jsonb, p_notes text default ''
) returns text language plpgsql security definer set search_path = public as $$
declare
  r record;
  flagged jsonb;
  missing jsonb;
  verdict text;
begin
  select * into r from structure_reviews where token = p_token;
  if r.id is null or r.revoked_at is not null or r.expires_at < now() then
    raise exception 'invalid';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'invalid';
  end if;
  if (select count(*) from structure_review_answers where review_id = r.id) >= 30 then
    raise exception 'rate_limited';
  end if;

  -- Only this university's own items, named as they are now.
  select coalesce(jsonb_agg(x.item), '[]'::jsonb) into flagged from (
    select jsonb_build_object('kind', 'unit', 'name', f.name, 'parent', '') as item
      from faculties f where f.institution_id = r.institution_id and f.id = any (coalesce(p_flagged, '{}'))
    union all
    select jsonb_build_object('kind', 'department', 'name', d.name, 'parent', coalesce(f.name, ''))
      from departments d left join faculties f on f.id = d.faculty_id
      where d.institution_id = r.institution_id and d.id = any (coalesce(p_flagged, '{}'))
    union all
    select jsonb_build_object('kind', 'programme', 'name', p.name, 'parent', coalesce(d.name, ''))
      from programmes p left join departments d on d.id = p.department_id
      where p.institution_id = r.institution_id and p.id = any (coalesce(p_flagged, '{}'))
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('unit', coalesce(f.name, ''), 'text', left(trim(m ->> 'text'), 2000))), '[]'::jsonb)
  into missing
  from jsonb_array_elements(case when jsonb_typeof(p_missing) = 'array' then p_missing else '[]'::jsonb end) m
  left join faculties f on f.id = public.path_uuid(m ->> 'unit') and f.institution_id = r.institution_id
  where length(trim(coalesce(m ->> 'text', ''))) > 0;
  if jsonb_array_length(missing) > 100 then
    raise exception 'invalid';
  end if;

  verdict := case when p_confirm and jsonb_array_length(flagged) = 0 and jsonb_array_length(missing) = 0
                       and length(trim(coalesce(p_notes, ''))) = 0
                  then 'confirmed' else 'changes' end;
  insert into structure_review_answers (review_id, institution_id, verdict, reviewer_name, reviewer_title, flagged, missing, notes, handled_at)
  values (r.id, r.institution_id, verdict, trim(p_name), left(trim(coalesce(p_title, '')), 200), flagged, missing,
          left(trim(coalesce(p_notes, '')), 5000), case when verdict = 'confirmed' then now() end);
  if verdict = 'confirmed' then
    perform set_config('ardoise.review_confirm', 'on', true);
    update institutions set structure_confirmed_at = now() where id = r.institution_id;
    perform set_config('ardoise.review_confirm', '', true);
  end if;
  return verdict;
end;
$$;

-- The master dashboard counts corrections waiting on the team.
drop function public.platform_schools();
create or replace function public.platform_schools()
returns table (
  id uuid, name text, slug text, default_locale text, created_at timestamptz,
  students_listed int, students_joined int, staff int, users int, open_requests int,
  status text, structure_confirmed_at timestamptz, structure_source text, faculties int, departments int,
  short_name text, brand_color text, logo_path text, city text, open_reviews int
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
    (select count(distinct m.user_id)::int from memberships m where m.institution_id = i.id),
    (select count(*)::int from support_requests r where r.institution_id = i.id and r.handled_at is null),
    i.status, i.structure_confirmed_at, i.structure_source,
    (select count(*)::int from faculties f where f.institution_id = i.id),
    (select count(*)::int from departments d where d.institution_id = i.id),
    i.short_name, i.brand_color, i.logo_path, i.city,
    (select count(*)::int from structure_review_answers a where a.institution_id = i.id and a.handled_at is null)
  from institutions i
  order by i.name;
end;
$$;

revoke execute on function public.create_structure_review(uuid), public.revoke_structure_review(uuid), public.platform_schools()
  from public, anon;
grant execute on function public.create_structure_review(uuid), public.revoke_structure_review(uuid), public.platform_schools()
  to authenticated;
revoke execute on function public.structure_review_open(text),
  public.structure_review_answer(text, text, text, boolean, uuid[], jsonb, text) from public;
grant execute on function public.structure_review_open(text),
  public.structure_review_answer(text, text, text, boolean, uuid[], jsonb, text) to anon, authenticated;
