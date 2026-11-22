-- Students pick their university from a list (or arrive on its own link) instead of
-- typing a school code. University names and their link names are public anyway.
create or replace function public.school_directory()
returns table (slug text, name text)
language sql stable security definer set search_path = public as $$
  select i.slug, i.name from institutions i order by i.name;
$$;
revoke execute on function public.school_directory() from public, anon, authenticated;
grant execute on function public.school_directory() to anon, authenticated;
