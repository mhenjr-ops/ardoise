-- Signed-out visitors can call nothing but transcript verification
-- (Supabase grants new functions to anon by default; take that back).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname <> 'verify_transcript'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end;
$$;
alter default privileges in schema public revoke execute on functions from public, anon;
