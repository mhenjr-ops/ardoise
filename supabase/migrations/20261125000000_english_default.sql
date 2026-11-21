-- English is the default language; French stays one tap away for every user.
alter table public.institutions alter column default_locale set default 'en';
alter table public.profiles alter column locale set default 'en';
alter table public.courses alter column language set default 'en';

create or replace function public.tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'locale' = 'fr' then 'fr' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
