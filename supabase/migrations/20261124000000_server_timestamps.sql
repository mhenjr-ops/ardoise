-- Topics and replies are timestamped by the server, so nobody can backdate a post.
-- (Seeds and admin scripts run without a user and keep the times they give.)
create or replace function public.tg_stamp_created_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_stamp_created_at() from public, anon;

create trigger stamp_discussion_topics before insert on public.discussion_topics
  for each row execute function public.tg_stamp_created_at();
create trigger stamp_discussion_replies before insert on public.discussion_replies
  for each row execute function public.tg_stamp_created_at();
