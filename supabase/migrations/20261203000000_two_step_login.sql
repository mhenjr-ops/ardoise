-- Two-step login (a 6-digit code from an authenticator app, on top of the password).
-- A session where the code has been entered is "aal2"; a password-only session is "aal1".
--
-- 1. Anyone who has turned two-step login on must enter their code before the database lets
--    them read or change anything: a stolen password alone opens nothing.
-- 2. The Ardoise team, owners, administrators and registrars must turn it on. Until they do,
--    the database gives them nothing (the app sends them to set it up). Demo accounts
--    (@demo.ardoise.cm, shared passwords for presentations) are exempt.
--
-- Enforced in the database, not just the app: in the permission helpers every policy and
-- function relies on, and in a restrictive policy on every table. A new table needs the same
-- policy; tests/roles.test.mjs fails if one is missing.

create or replace function public.mfa_required(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select email from auth.users where id = p_user), '') not like '%@demo.ardoise.cm'
     and (exists (select 1 from platform_admins where user_id = p_user)
          or exists (select 1 from memberships where user_id = p_user and role in ('owner', 'admin', 'registrar')));
$$;

create or replace function public.mfa_ok()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return true; -- signed out: the policies themselves decide
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then
    return true;
  end if;
  if exists (select 1 from auth.mfa_factors where user_id = me and status = 'verified') then
    return false; -- turned on, code not entered yet
  end if;
  return not public.mfa_required(me);
end;
$$;

-- What the app needs to know about the signed-in account, readable before the code is entered.
create or replace function public.account_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'has_mfa', exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified'),
    'mfa_required', public.mfa_required(auth.uid()),
    'platform', exists (select 1 from platform_admins where user_id = auth.uid()),
    'roles', coalesce((select jsonb_agg(distinct m.role) from memberships m where m.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;

-- The permission helpers: same as before, and only once two-step login is satisfied.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid()) and public.mfa_ok();
$$;

create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'owner') and public.mfa_ok();
$$;

create or replace function public.is_inst_member(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.institution_id = inst and m.user_id = auth.uid()) and public.mfa_ok();
$$;

create or replace function public.has_inst_role(inst uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.institution_id = inst and m.user_id = auth.uid() and (m.role = any (roles) or m.role = 'owner')
  ) and public.mfa_ok();
$$;

create or replace function public.is_school_staff(inst uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where institution_id = inst and user_id = auth.uid()
                 and role in ('owner', 'admin', 'registrar', 'dean', 'hod', 'teacher')) and public.mfa_ok();
$$;

create or replace function public.course_role(course uuid)
returns text language sql stable security definer set search_path = public as $$
  select e.role from enrollments e where e.course_id = course and e.user_id = auth.uid() and public.mfa_ok();
$$;

create or replace function public.is_course_staff(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (exists (
    select 1 from enrollments e
    where e.course_id = course and e.user_id = auth.uid() and e.role in ('teacher', 'ta')
  ) or exists (
    select 1 from courses c
    join memberships m on m.institution_id = c.institution_id
    where c.id = course and m.user_id = auth.uid() and m.role = 'owner'
  )) and public.mfa_ok();
$$;

create or replace function public.is_course_member(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (exists (
    select 1 from enrollments e where e.course_id = course and e.user_id = auth.uid()
  ) or public.is_course_staff(course)) and public.mfa_ok();
$$;

-- Every table: rows only for a session that satisfies two-step login. The check runs once per
-- statement ("(select ...)"), except on a table whose own policies read that same table (the
-- support-request daily limit, say), where a subquery would make Postgres see a loop.
do $$
declare
  t record;
  expr text;
begin
  for t in
    select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  loop
    expr := case when exists (
        select 1 from pg_policies p
        where p.schemaname = t.nspname and p.tablename = t.relname
          and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ ('\m' || t.relname || '\M'))
      then 'public.mfa_ok()' else '(select public.mfa_ok())' end;
    execute format('create policy two_step on %I.%I as restrictive for all to authenticated using (%s) with check (%s)',
                   t.nspname, t.relname, expr, expr);
  end loop;
end $$;

revoke execute on function public.mfa_required(uuid), public.mfa_ok(), public.account_status() from public, anon;
revoke execute on function public.mfa_required(uuid) from authenticated;
grant execute on function public.mfa_ok(), public.account_status() to authenticated;
