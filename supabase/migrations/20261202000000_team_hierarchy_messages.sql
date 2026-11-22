-- The Ardoise team as a real team:
-- 1. A hierarchy: each teammate has a title (what they do) and reports to someone on the team.
--    People invited but not joined yet already have their place in it.
-- 2. Messages between teammates: one conversation for the whole team, and one-to-one
--    conversations. Only the two people in a one-to-one conversation can read it.

-- 1. Hierarchy -----------------------------------------------------------------------------
alter table public.platform_admins
  add column title text not null default '' check (length(title) <= 80),
  add column reports_to uuid references public.profiles (id) on delete set null;
update public.platform_admins set reports_to = coalesce(invited_by, (select user_id from public.platform_admins where role = 'owner' limit 1))
where role = 'member';

alter table public.platform_invitations
  add column title text not null default '' check (length(title) <= 80),
  add column reports_to uuid references public.profiles (id) on delete set null;
update public.platform_invitations set reports_to = created_by where reports_to is null;

-- p_manager is someone on the team, and choosing them makes no loop.
create or replace function public.team_valid_manager(p_user uuid, p_manager uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  cur uuid := p_manager;
  steps int := 0;
begin
  if p_manager is null or p_manager = p_user or not exists (select 1 from platform_admins where user_id = p_manager) then
    return false;
  end if;
  while cur is not null and steps < 200 loop
    if cur = p_user then
      return false;
    end if;
    select reports_to into cur from platform_admins where user_id = cur;
    steps := steps + 1;
  end loop;
  return true;
end;
$$;

create or replace function public.team_owner()
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from platform_admins where role = 'owner' order by created_at limit 1;
$$;

drop function public.create_team_invitation(text, text);
create or replace function public.create_team_invitation(
  p_email text default null, p_full_name text default '', p_title text default '', p_reports_to uuid default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  tok text;
  boss uuid := coalesce(p_reports_to, auth.uid());
begin
  if not public.is_platform_owner() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from platform_admins where user_id = boss) then
    raise exception 'invalid';
  end if;
  insert into platform_invitations (email, full_name, title, reports_to, created_by)
  values (nullif(lower(trim(coalesce(p_email, ''))), ''), left(trim(coalesce(p_full_name, '')), 200),
          left(trim(coalesce(p_title, '')), 80), boss, auth.uid())
  returning token into tok;
  return tok;
end;
$$;

create or replace function public.accept_team_invitation(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record;
  me_email text;
  boss uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into v from platform_invitations where token = p_token for update;
  if v.id is null or v.revoked_at is not null then
    raise exception 'invitation_invalid';
  end if;
  if v.accepted_at is not null then
    if v.accepted_by = auth.uid() then
      return;
    end if;
    raise exception 'invitation_used';
  end if;
  if v.expires_at < now() then
    raise exception 'invitation_expired';
  end if;
  select lower(email) into me_email from profiles where id = auth.uid();
  if v.email is not null and v.email <> me_email then
    raise exception 'invitation_wrong_email';
  end if;
  -- A university account stays a university account: the team uses separate logins.
  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'school_account';
  end if;
  -- Their manager, if still on the team; otherwise the owner.
  boss := case when exists (select 1 from platform_admins where user_id = v.reports_to) then v.reports_to else public.team_owner() end;
  insert into platform_admins (user_id, role, invited_by, title, reports_to)
  values (auth.uid(), 'member', v.created_by, v.title, boss)
  on conflict (user_id) do nothing;
  update platform_invitations set accepted_by = auth.uid(), accepted_at = now() where id = v.id;
  update profiles set full_name = v.full_name where id = auth.uid() and full_name = '' and v.full_name <> '';
end;
$$;

-- The owner sets what each person does and whom they report to (the owner reports to no one).
create or replace function public.update_teammate(p_user uuid, p_title text, p_reports_to uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  target record;
begin
  if not public.is_platform_owner() then
    raise exception 'forbidden';
  end if;
  select * into target from platform_admins where user_id = p_user;
  if target.user_id is null then
    raise exception 'invalid';
  end if;
  if target.role = 'member' and not public.team_valid_manager(p_user, p_reports_to) then
    raise exception 'invalid';
  end if;
  update platform_admins
  set title = left(trim(coalesce(p_title, '')), 80),
      reports_to = case when target.role = 'owner' then null else p_reports_to end
  where user_id = p_user;
end;
$$;

create or replace function public.update_team_invitation(p_invitation uuid, p_title text, p_reports_to uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from platform_admins where user_id = p_reports_to) then
    raise exception 'invalid';
  end if;
  update platform_invitations set title = left(trim(coalesce(p_title, '')), 80), reports_to = p_reports_to
  where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

-- Removing someone moves the people under them (and their pending invitations) up a level.
create or replace function public.remove_teammate(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  boss uuid;
begin
  if not public.is_platform_owner() or p_user = auth.uid() then
    raise exception 'forbidden';
  end if;
  select coalesce(reports_to, public.team_owner()) into boss from platform_admins where user_id = p_user and role = 'member';
  if boss is null then
    return;
  end if;
  update platform_admins set reports_to = boss where reports_to = p_user;
  update platform_invitations set reports_to = boss where reports_to = p_user and accepted_at is null;
  delete from platform_admins where user_id = p_user and role = 'member';
end;
$$;

drop function public.platform_team();
create or replace function public.platform_team()
returns table (
  user_id uuid, full_name text, email text, role text, title text, reports_to uuid,
  joined_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select a.user_id, p.full_name, p.email, a.role, a.title, a.reports_to, a.created_at, u.last_sign_in_at
  from platform_admins a join profiles p on p.id = a.user_id left join auth.users u on u.id = a.user_id
  order by (a.role = 'owner') desc, a.created_at;
end;
$$;

-- 2. Messages ------------------------------------------------------------------------------
create table public.team_threads (
  id               uuid primary key default gen_random_uuid(),
  -- both empty: the whole team; otherwise the two people, smaller id first
  member_a         uuid references public.profiles (id) on delete cascade,
  member_b         uuid references public.profiles (id) on delete cascade,
  key              text generated always as (coalesce(member_a::text || ':' || member_b::text, 'team')) stored unique,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  check ((member_a is null and member_b is null) or (member_a is not null and member_b is not null and member_a < member_b))
);

create table public.team_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.team_threads (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at  timestamptz not null default now()
);
create index team_messages_thread_idx on public.team_messages (thread_id, created_at);

create table public.team_reads (
  thread_id     uuid not null references public.team_threads (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create or replace function public.team_can_read(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() and exists (
    select 1 from team_threads t
    where t.id = p_thread and (t.member_a is null or auth.uid() in (t.member_a, t.member_b))
  );
$$;

alter table public.team_threads enable row level security;
alter table public.team_messages enable row level security;
alter table public.team_reads enable row level security;
create policy team_threads_select on public.team_threads for select to authenticated using (public.team_can_read(id));
create policy team_messages_select on public.team_messages for select to authenticated using (public.team_can_read(thread_id));
create policy team_reads_select on public.team_reads for select to authenticated using (user_id = auth.uid());
grant select on public.team_threads, public.team_messages, public.team_reads to authenticated;

-- The conversation with p_peer (null: the whole team), made the first time it is needed.
create or replace function public.team_thread(p_peer uuid, p_create boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  tid uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_peer is not null then
    if p_peer = me or not exists (select 1 from platform_admins where user_id = p_peer) then
      raise exception 'forbidden';
    end if;
    a := least(me, p_peer);
    b := greatest(me, p_peer);
  end if;
  select id into tid from team_threads where key = coalesce(a::text || ':' || b::text, 'team');
  if tid is null and p_create then
    insert into team_threads (member_a, member_b) values (a, b)
    on conflict (key) do nothing
    returning id into tid;
    if tid is null then
      select id into tid from team_threads where key = coalesce(a::text || ':' || b::text, 'team');
    end if;
  end if;
  return tid;
end;
$$;

create or replace function public.team_send(p_peer uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  body text := trim(coalesce(p_body, ''));
begin
  if body = '' or length(body) > 4000 then
    raise exception 'invalid';
  end if;
  tid := public.team_thread(p_peer, true);
  if (select count(*) from team_messages where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into team_messages (thread_id, sender_id, body) values (tid, auth.uid(), body);
  update team_threads set last_message_at = now() where id = tid;
  insert into team_reads (thread_id, user_id, last_read_at) values (tid, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return tid;
end;
$$;

create or replace function public.team_mark_read(p_peer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  tid uuid := public.team_thread(p_peer, false);
begin
  if tid is not null then
    insert into team_reads (thread_id, user_id, last_read_at) values (tid, auth.uid(), now())
    on conflict (thread_id, user_id) do update set last_read_at = now();
  end if;
end;
$$;

-- One line per conversation this person can see: who it is with, the last message, unread count.
create or replace function public.team_inbox()
returns table (peer uuid, last_body text, last_sender uuid, last_at timestamptz, unread int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  return query
  select case when t.member_a is null then null when t.member_a = auth.uid() then t.member_b else t.member_a end,
         lm.body, lm.sender_id, lm.created_at,
         (select count(*)::int from team_messages m
          where m.thread_id = t.id and m.sender_id is distinct from auth.uid()
            and m.created_at > coalesce((select r.last_read_at from team_reads r where r.thread_id = t.id and r.user_id = auth.uid()), '-infinity'))
  from team_threads t
  left join lateral (select m.body, m.sender_id, m.created_at from team_messages m where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
  where t.member_a is null or auth.uid() in (t.member_a, t.member_b)
  order by t.last_message_at desc;
end;
$$;

-- Conversations with something unread (the badge in the sidebar).
create or replace function public.team_unread_count()
returns int language sql stable security definer set search_path = public as $$
  select case when not public.is_platform_admin() then 0 else (
    select count(*)::int from team_threads t
    where (t.member_a is null or auth.uid() in (t.member_a, t.member_b))
      and exists (
        select 1 from team_messages m
        where m.thread_id = t.id and m.sender_id is distinct from auth.uid()
          and m.created_at > coalesce((select r.last_read_at from team_reads r where r.thread_id = t.id and r.user_id = auth.uid()), '-infinity'))
  ) end;
$$;

revoke execute on function public.team_valid_manager(uuid, uuid), public.team_owner(),
  public.create_team_invitation(text, text, text, uuid), public.accept_team_invitation(text),
  public.update_teammate(uuid, text, uuid), public.update_team_invitation(uuid, text, uuid), public.remove_teammate(uuid),
  public.platform_team(), public.team_can_read(uuid), public.team_thread(uuid, boolean), public.team_send(uuid, text),
  public.team_mark_read(uuid), public.team_inbox(), public.team_unread_count() from public, anon;
revoke execute on function public.team_valid_manager(uuid, uuid), public.team_owner(), public.team_thread(uuid, boolean) from authenticated;
grant execute on function public.create_team_invitation(text, text, text, uuid), public.accept_team_invitation(text),
  public.update_teammate(uuid, text, uuid), public.update_team_invitation(uuid, text, uuid), public.remove_teammate(uuid),
  public.platform_team(), public.team_can_read(uuid), public.team_send(uuid, text), public.team_mark_read(uuid),
  public.team_inbox(), public.team_unread_count() to authenticated;
