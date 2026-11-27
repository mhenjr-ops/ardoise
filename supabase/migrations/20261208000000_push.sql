-- Push notifications to the phone app. Every row added to public.notifications (an
-- announcement, a new assignment, a mark, a message, results...) also goes to that person's
-- phones through Expo's push service, unless they muted that kind. The database sends it
-- itself with pg_net: requests leave after the transaction commits, a hundred per request.
-- Expo's answers are read on the next send, and phones Expo no longer knows are forgotten.

do $$
begin
  -- Its functions live in the "net" schema; the extension itself is registered under "extensions".
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$$;

create table public.push_devices (
  token         text primary key check (token ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,120}\]$'),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  platform      text not null default 'android' check (platform in ('android', 'ios')),
  locale        text not null default 'fr' check (locale in ('fr', 'en')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices (user_id);

create table public.push_mutes (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  kind     text not null check (kind in ('announcement', 'assignment', 'grade', 'submission', 'message',
                                         'discussion', 'results', 'attendance')),
  primary key (user_id, kind)
);

-- What was sent, so Expo's answer can be read later (ticket order = token order).
create table public.push_requests (
  request_id  bigint primary key,
  tokens      text[] not null,
  created_at  timestamptz not null default now()
);

alter table public.push_devices enable row level security;
alter table public.push_mutes enable row level security;
alter table public.push_requests enable row level security;
create policy push_devices_own on public.push_devices for select to authenticated using (user_id = auth.uid());
create policy push_mutes_own on public.push_mutes for select to authenticated using (user_id = auth.uid());
create policy two_step on public.push_devices as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy two_step on public.push_mutes as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy two_step on public.push_requests as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select on public.push_devices, public.push_mutes to authenticated;

-- The phone registers itself after sign-in (and on every launch, which keeps it fresh).
-- A phone that changes hands moves to the new account. At most ten phones per account.
create or replace function public.register_push_device(p_token text, p_platform text default 'android', p_locale text default 'fr')
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  if not public.mfa_ok() then
    raise exception 'mfa_required';
  end if;
  if coalesce(p_token, '') !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,120}\]$' then
    raise exception 'invalid';
  end if;
  insert into push_devices (token, user_id, platform, locale)
  values (p_token, me, case when p_platform = 'ios' then 'ios' else 'android' end, case when p_locale = 'en' then 'en' else 'fr' end)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, locale = excluded.locale, last_seen_at = now();
  delete from push_devices where user_id = me and token in (
    select token from push_devices where user_id = me order by last_seen_at desc offset 10);
end;
$$;

-- Signing out stops pushes to that phone.
create or replace function public.unregister_push_device(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_devices where token = p_token and user_id = auth.uid();
$$;

create or replace function public.set_push_mute(p_kind text, p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_muted then
    insert into push_mutes (user_id, kind) values (auth.uid(), p_kind) on conflict do nothing;
  else
    delete from push_mutes where user_id = auth.uid() and kind = p_kind;
  end if;
end;
$$;

-- 14.50 → "14,5" in French, "14.5" in English; anything that isn't a number is kept as it is.
create or replace function public.push_num(p_value text, p_fr boolean)
returns text language sql immutable set search_path = public as $$
  select case
    when p_value is null then ''
    when p_value !~ '^-?[0-9]+(\.[0-9]+)?$' then p_value
    else (select case when p_fr then replace(v, '.', ',') else v end
          from (select case when r like '%.%' then rtrim(rtrim(r, '0'), '.') else r end as v
                from (select round(p_value::numeric, 2)::text as r) a) b)
  end
$$;

-- The words on the phone, in the language the app is set to (same wording as in the app).
create or replace function public.push_text(p_kind text, p_data jsonb, p_locale text)
returns table (title text, body text) language plpgsql immutable set search_path = public as $$
declare
  fr boolean := p_locale = 'fr';
  d jsonb := coalesce(p_data, '{}'::jsonb);
  course text := coalesce(nullif(d ->> 'course', ''), 'Ardoise');
  t text := coalesce(d ->> 'title', '');
begin
  case p_kind
    when 'announcement' then
      title := course; body := case when fr then 'Nouvelle annonce : ' else 'New announcement: ' end || t;
    when 'assignment' then
      title := course; body := case when fr then 'Nouveau devoir : ' else 'New assignment: ' end || t;
    when 'grade' then
      title := course;
      body := case when fr then 'Note publiée pour « ' || t || ' » : ' else 'Mark posted for “' || t || '”: ' end
        || public.push_num(d ->> 'score', fr) || '/' || public.push_num(d ->> 'points', fr);
    when 'submission' then
      title := course;
      body := coalesce(d ->> 'student', '') || case when fr then ' a rendu « ' || t || ' »' else ' handed in “' || t || '”' end;
    when 'message' then
      title := coalesce(nullif(d ->> 'sender', ''), 'Ardoise'); body := coalesce(d ->> 'subject', '');
    when 'discussion' then
      title := course;
      body := coalesce(d ->> 'author', '') || case when fr then ' a répondu dans « ' || t || ' »' else ' replied in “' || t || '”' end;
    when 'results' then
      title := case when fr then 'Résultats publiés' else 'Results published' end;
      body := concat_ws(', ', nullif(d ->> 'programme', ''), nullif(d ->> 'semester', ''));
    when 'attendance' then
      title := course; body := case when fr then 'Appel enregistré' else 'Attendance recorded' end;
    else
      title := 'Ardoise'; body := '';
  end case;
  title := left(title, 120);
  body := left(body, 300);
  return next;
end;
$$;

-- Read Expo's answers to earlier sends: forget phones Expo says no longer exist.
create or replace function public.push_read_answers()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if to_regclass('net._http_response') is null then
    return;
  end if;
  for r in
    select p.request_id, p.tokens, h.status_code, h.content
    from push_requests p join net._http_response h on h.id = p.request_id
  loop
    if r.status_code = 200 and r.content is not null and left(r.content, 1) = '{' then
      delete from push_devices where token in (
        select r.tokens[x.k::int]
        from jsonb_array_elements(coalesce((r.content::jsonb) -> 'data', '[]'::jsonb)) with ordinality as x(ticket, k)
        where x.ticket ->> 'status' = 'error' and x.ticket -> 'details' ->> 'error' = 'DeviceNotRegistered');
    end if;
    delete from push_requests where request_id = r.request_id;
  end loop;
  delete from push_requests where created_at < now() - interval '1 day';
  delete from push_devices where last_seen_at < now() - interval '120 days';
end;
$$;

create or replace function public.tg_push_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  msgs jsonb;
  chunk jsonb;
  req bigint;
  total int;
  i int := 0;
begin
  if to_regnamespace('net') is null then
    return null; -- no pg_net here (local tests without the stand-in): nothing to send
  end if;
  -- A push that can't be sent must never stop the announcement, mark or message itself.
  begin
  perform public.push_read_answers();
  select coalesce(jsonb_agg(m.msg order by m.ord), '[]'::jsonb) into msgs
  from (
    select row_number() over (order by n.id, d.token) as ord,
      jsonb_build_object(
        'to', d.token,
        'title', t.title,
        'body', t.body,
        'data', jsonb_build_object('link', n.link, 'id', n.id, 'kind', n.kind),
        'channelId', 'default',
        'priority', 'high',
        'sound', 'default') as msg
    from inserted n
    join push_devices d on d.user_id = n.user_id
    cross join lateral public.push_text(n.kind, n.data, d.locale) t
    where not exists (select 1 from push_mutes m where m.user_id = n.user_id and m.kind = n.kind)
  ) m;
  total := jsonb_array_length(msgs);
  while i < total loop
    select jsonb_agg(x.e order by x.k) into chunk
    from jsonb_array_elements(msgs) with ordinality as x(e, k)
    where x.k > i and x.k <= i + 100;
    req := net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := chunk,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    insert into push_requests (request_id, tokens)
    select req, array(select x.e ->> 'to' from jsonb_array_elements(chunk) with ordinality as x(e, k) order by x.k);
    i := i + 100;
  end loop;
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger push_notifications after insert on public.notifications
  referencing new table as inserted
  for each statement execute function public.tg_push_notifications();

revoke execute on function public.push_num(text, boolean), public.push_text(text, jsonb, text), public.push_read_answers(), public.tg_push_notifications()
  from public, anon, authenticated;
revoke execute on function public.register_push_device(text, text, text), public.unregister_push_device(text),
  public.set_push_mute(text, boolean) from public, anon;
grant execute on function public.register_push_device(text, text, text), public.unregister_push_device(text),
  public.set_push_mute(text, boolean) to authenticated;
