-- Alerts for the Ardoise team: server errors and unusual activity, raised by the database
-- itself (triggers), so nothing in a browser can switch them off.
--   mark_changes     someone changes many existing marks in a short time
--   privileged_role  someone becomes a university's head, administrator or registrar
--   team_change      someone joins or leaves the Ardoise team
--   login_attack     a matricule hits the wrong-password limit
--   login_flood      many wrong passwords across all universities at once
--   join_attack      one account tries many matricules
--   app_error        the web app fails on a page or an action
-- The same alert within six hours is counted, not repeated.

create table public.alerts (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('app_error', 'mark_changes', 'privileged_role', 'team_change',
                                                'login_attack', 'login_flood', 'join_attack')),
  severity        text not null check (severity in ('info', 'warning', 'critical')),
  institution_id  uuid references public.institutions (id) on delete cascade,
  dedupe_key      text not null default '',
  detail          jsonb not null default '{}'::jsonb,
  occurrences     int not null default 1,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  seen_at         timestamptz,
  seen_by         uuid references public.profiles (id) on delete set null
);
create index alerts_recent_idx on public.alerts (created_at desc);
create index alerts_open_idx on public.alerts (kind, dedupe_key) where seen_at is null;
create index mark_audit_log_changer_idx on public.mark_audit_log (changed_by, changed_at);

alter table public.alerts enable row level security;
create policy alerts_team_read on public.alerts for select to authenticated using (public.is_platform_admin());
create policy alerts_team_seen on public.alerts for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy two_step on public.alerts as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select, update (seen_at, seen_by) on public.alerts to authenticated;

-- Raise (or count again) an alert. Internal: only triggers and the error reporter call it.
create or replace function public.raise_alert(p_kind text, p_severity text, p_institution uuid, p_key text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  existing bigint;
begin
  select id into existing from alerts
  where kind = p_kind and dedupe_key = p_key and seen_at is null and created_at > now() - interval '6 hours'
  order by id desc limit 1;
  if existing is not null then
    update alerts set occurrences = occurrences + 1, last_seen_at = now(), detail = p_detail where id = existing;
    return;
  end if;
  -- A flood of new alerts is itself the signal; past 300 an hour, stop adding.
  if (select count(*) from alerts where created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into alerts (kind, severity, institution_id, dedupe_key, detail)
  values (p_kind, p_severity, p_institution, left(coalesce(p_key, ''), 300), coalesce(p_detail, '{}'::jsonb));
end;
$$;

create or replace function public.alert_who(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.full_name, ''), p.email, '?') from profiles p where p.id = p_user;
$$;

-- Many existing marks changed by one person in ten minutes (first entries don't count).
create or replace function public.tg_alert_mark_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if new.old_score is null or new.changed_by is null then
    return null;
  end if;
  select count(*) into n from mark_audit_log
  where changed_by = new.changed_by and institution_id = new.institution_id
    and old_score is not null and changed_at > now() - interval '10 minutes';
  if n >= 30 then
    perform public.raise_alert('mark_changes', 'warning', new.institution_id, 'marks:' || new.changed_by,
      jsonb_build_object('who', public.alert_who(new.changed_by), 'count', n));
  end if;
  return null;
end;
$$;
create trigger alert_mark_changes after insert on public.mark_audit_log
  for each row execute function public.tg_alert_mark_changes();

-- Someone becomes a university's head, administrator or registrar.
create or replace function public.tg_alert_privileged_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('owner', 'admin', 'registrar') and (tg_op = 'INSERT' or old.role is distinct from new.role) then
    perform public.raise_alert('privileged_role', 'info', new.institution_id, 'role:' || new.id,
      jsonb_build_object('who', public.alert_who(new.user_id), 'role', new.role,
                         'by', case when auth.uid() is null or auth.uid() = new.user_id then null else public.alert_who(auth.uid()) end));
  end if;
  return null;
end;
$$;
create trigger alert_privileged_role after insert or update of role on public.memberships
  for each row execute function public.tg_alert_privileged_role();

-- Someone joins or leaves the Ardoise team.
create or replace function public.tg_alert_team_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.raise_alert('team_change', 'warning', null,
    'team:' || coalesce(new.user_id, old.user_id) || ':' || lower(tg_op),
    jsonb_build_object('who', public.alert_who(coalesce(new.user_id, old.user_id)),
                       'action', case when tg_op = 'INSERT' then 'joined' else 'left' end));
  return null;
end;
$$;
create trigger alert_team_change after insert or delete on public.platform_admins
  for each row execute function public.tg_alert_team_change();

-- Wrong passwords with a matricule: one matricule at its limit, or many across the platform.
create or replace function public.tg_alert_login_attempts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
  total int;
begin
  select count(*) into n from login_attempts where key = new.key and attempted_at > now() - interval '15 minutes';
  if n >= 10 then
    perform public.raise_alert('login_attack', 'warning', null, 'login:' || new.key,
      jsonb_build_object('matricule', new.key, 'count', n));
  end if;
  select count(*) into total from login_attempts where attempted_at > now() - interval '10 minutes';
  if total >= 100 then
    perform public.raise_alert('login_flood', 'critical', null, 'login-flood',
      jsonb_build_object('count', total));
  end if;
  return null;
end;
$$;
create trigger alert_login_attempts after insert on public.login_attempts
  for each row execute function public.tg_alert_login_attempts();

-- One account trying many matricules to join a university.
create or replace function public.tg_alert_join_attempts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
  uid uuid;
begin
  if new.key not like 'claim:%' then
    return null;
  end if;
  select count(*) into n from join_attempts where key = new.key and attempted_at > now() - interval '1 hour';
  if n >= 10 then
    uid := public.path_uuid(substr(new.key, 7));
    perform public.raise_alert('join_attack', 'warning', null, new.key,
      jsonb_build_object('who', coalesce(public.alert_who(uid), '?'), 'count', n));
  end if;
  return null;
end;
$$;
create trigger alert_join_attempts after insert on public.join_attempts
  for each row execute function public.tg_alert_join_attempts();

-- The web app reports its own server errors. Callable without signing in (errors happen to
-- anyone), so everything is cut short, the same error is counted rather than repeated, and
-- raise_alert stops at 300 new alerts an hour.
create or replace function public.report_app_error(p_path text, p_message text, p_digest text default '', p_where text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  path text := left(split_part(coalesce(p_path, ''), '?', 1), 200);
  msg text := left(coalesce(p_message, ''), 500);
begin
  if msg = '' or msg like 'NEXT_%' then
    return;
  end if;
  perform public.raise_alert('app_error', 'warning', null, 'error:' || md5(path || '|' || msg),
    jsonb_build_object('path', path, 'message', msg, 'digest', left(coalesce(p_digest, ''), 64),
                       'where', left(coalesce(p_where, ''), 40)));
end;
$$;

-- Unseen alerts, for the sidebar badge.
create or replace function public.alerts_unseen_count()
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_platform_admin()
    then (select count(*)::int from alerts where seen_at is null and severity <> 'info') else 0 end;
$$;

revoke execute on function public.raise_alert(text, text, uuid, text, jsonb), public.alert_who(uuid),
  public.tg_alert_mark_changes(), public.tg_alert_privileged_role(), public.tg_alert_team_change(),
  public.tg_alert_login_attempts(), public.tg_alert_join_attempts() from public, anon, authenticated;
revoke execute on function public.report_app_error(text, text, text, text), public.alerts_unseen_count() from public;
grant execute on function public.report_app_error(text, text, text, text) to anon, authenticated;
grant execute on function public.alerts_unseen_count() to authenticated;
