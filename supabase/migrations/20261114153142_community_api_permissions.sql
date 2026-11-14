-- Expose a small invoker API; privileged implementations remain in an unexposed schema.
begin;
do $$ declare item record;
begin
  for item in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'realm_feedback_is_moderator', 'realm_feedback_sync_profile', 'realm_feedback_summary',
      'realm_feedback_like', 'realm_feedback_page', 'realm_feedback_comment_create',
      'realm_feedback_comment_edit', 'realm_feedback_comment_delete',
      'realm_feedback_moderation', 'realm_feedback_set_hidden'
    ]) and p.prosecdef
  loop
    execute replace(pg_get_functiondef(item.oid), 'FUNCTION public.', 'FUNCTION realm_private.');
  end loop;
end $$;
grant usage on schema realm_private to anon, authenticated;
alter table realm_private.moderators enable row level security;
alter table realm_private.comment_limits enable row level security;
create index if not exists realm_likes_author on public.realm_likes(user_id);
create index if not exists realm_comments_moderation_page on public.realm_comments(created_at desc, id desc);

create or replace function public.realm_feedback_is_moderator()
returns boolean language sql stable security invoker set search_path = '' as $$
  select realm_private.realm_feedback_is_moderator();
$$;
revoke all on function public.realm_feedback_is_moderator(), realm_private.realm_feedback_is_moderator() from public, anon, authenticated;
grant execute on function public.realm_feedback_is_moderator(), realm_private.realm_feedback_is_moderator() to anon, authenticated;

create or replace function public.realm_feedback_sync_profile()
returns void language sql security invoker set search_path = '' as $$
  select realm_private.realm_feedback_sync_profile();
$$;
revoke all on function public.realm_feedback_sync_profile(), realm_private.realm_feedback_sync_profile() from public, anon, authenticated;
grant execute on function public.realm_feedback_sync_profile(), realm_private.realm_feedback_sync_profile() to authenticated;

create or replace function public.realm_feedback_summary(p_type text, p_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select realm_private.realm_feedback_summary(p_type, p_id);
$$;
revoke all on function public.realm_feedback_summary(text, text), realm_private.realm_feedback_summary(text, text) from public, anon, authenticated;
grant execute on function public.realm_feedback_summary(text, text), realm_private.realm_feedback_summary(text, text) to anon, authenticated;

create or replace function public.realm_feedback_like(p_type text, p_id text, p_active boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select realm_private.realm_feedback_like(p_type, p_id, p_active);
$$;
revoke all on function public.realm_feedback_like(text, text, boolean), realm_private.realm_feedback_like(text, text, boolean) from public, anon, authenticated;
grant execute on function public.realm_feedback_like(text, text, boolean), realm_private.realm_feedback_like(text, text, boolean) to authenticated;

create or replace function public.realm_feedback_page(p_type text, p_id text, p_before_time timestamptz default null, p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select realm_private.realm_feedback_page(p_type, p_id, p_before_time, p_before_id);
$$;
revoke all on function public.realm_feedback_page(text, text, timestamptz, uuid), realm_private.realm_feedback_page(text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.realm_feedback_page(text, text, timestamptz, uuid), realm_private.realm_feedback_page(text, text, timestamptz, uuid) to anon, authenticated;

create or replace function public.realm_feedback_comment_create(p_type text, p_id text, p_body text)
returns uuid language sql security invoker set search_path = '' as $$
  select realm_private.realm_feedback_comment_create(p_type, p_id, p_body);
$$;
revoke all on function public.realm_feedback_comment_create(text, text, text), realm_private.realm_feedback_comment_create(text, text, text) from public, anon, authenticated;
grant execute on function public.realm_feedback_comment_create(text, text, text), realm_private.realm_feedback_comment_create(text, text, text) to authenticated;

create or replace function public.realm_feedback_comment_edit(p_comment uuid, p_body text)
returns void language sql security invoker set search_path = '' as $$
  select realm_private.realm_feedback_comment_edit(p_comment, p_body);
$$;
revoke all on function public.realm_feedback_comment_edit(uuid, text), realm_private.realm_feedback_comment_edit(uuid, text) from public, anon, authenticated;
grant execute on function public.realm_feedback_comment_edit(uuid, text), realm_private.realm_feedback_comment_edit(uuid, text) to authenticated;

create or replace function public.realm_feedback_comment_delete(p_comment uuid)
returns void language sql security invoker set search_path = '' as $$
  select realm_private.realm_feedback_comment_delete(p_comment);
$$;
revoke all on function public.realm_feedback_comment_delete(uuid), realm_private.realm_feedback_comment_delete(uuid) from public, anon, authenticated;
grant execute on function public.realm_feedback_comment_delete(uuid), realm_private.realm_feedback_comment_delete(uuid) to authenticated;

create or replace function public.realm_feedback_moderation(p_before_time timestamptz default null, p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select realm_private.realm_feedback_moderation(p_before_time, p_before_id);
$$;
revoke all on function public.realm_feedback_moderation(timestamptz, uuid), realm_private.realm_feedback_moderation(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.realm_feedback_moderation(timestamptz, uuid), realm_private.realm_feedback_moderation(timestamptz, uuid) to authenticated;

create or replace function public.realm_feedback_set_hidden(p_comment uuid, p_hidden boolean)
returns void language sql security invoker set search_path = '' as $$
  select realm_private.realm_feedback_set_hidden(p_comment, p_hidden);
$$;
revoke all on function public.realm_feedback_set_hidden(uuid, boolean), realm_private.realm_feedback_set_hidden(uuid, boolean) from public, anon, authenticated;
grant execute on function public.realm_feedback_set_hidden(uuid, boolean), realm_private.realm_feedback_set_hidden(uuid, boolean) to authenticated;

alter policy realm_comments_read on public.realm_comments using (hidden_at is null or author_id = (select auth.uid()) or (select public.realm_feedback_is_moderator()));
alter policy realm_profiles_read on public.realm_profiles using (id = (select auth.uid()) or (select public.realm_feedback_is_moderator()) or exists(select 1 from public.realm_comments c where c.author_id = realm_profiles.id and c.hidden_at is null));
alter policy realm_likes_read_own on public.realm_likes using (user_id = (select auth.uid()));
alter policy realm_avatar_read on storage.objects using (
  bucket_id = 'realm-profile-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or (select public.realm_feedback_is_moderator()) or
    exists(select 1 from public.realm_profiles p where p.avatar_path = objects.name and exists(select 1 from public.realm_comments c where c.author_id = p.id and c.hidden_at is null))
  )
);
alter policy realm_avatar_insert on storage.objects with check (
  bucket_id = 'realm-profile-photos' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.webp$') and (select realm_private.avatar_can_insert())
);
alter policy realm_avatar_delete on storage.objects using (bucket_id = 'realm-profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
notify pgrst, 'reload schema';
commit;
