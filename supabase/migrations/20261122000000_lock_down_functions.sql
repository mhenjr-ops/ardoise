-- =====================================================================
-- Ardoise LMS — lock down function execution
-- Every function already checks auth.uid() itself; this removes the
-- extra surface anyway. Signed-out visitors can only verify transcripts,
-- and nobody can call trigger functions through the API.
-- =====================================================================

alter function public.tg_touch_updated_at() set search_path = public;
alter function public.tg_guard_deliberation_delete() set search_path = public;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;

  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from authenticated', f.sig);
  end loop;
end;
$$;

grant execute on function public.verify_transcript(text) to anon;

-- Functions added later start private too.
alter default privileges in schema public revoke execute on functions from public, anon;
