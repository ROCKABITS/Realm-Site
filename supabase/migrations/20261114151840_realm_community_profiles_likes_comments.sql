-- Realm Studios: private profile photos and shared community feedback.
-- Run once in the project's Supabase SQL Editor, or apply as a migration.
begin;
create schema if not exists realm_private;
revoke all on schema realm_private from public, anon, authenticated;

create table if not exists realm_private.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists realm_private.comment_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_post_at timestamptz not null,
  post_day date not null,
  posts_today integer not null
);
revoke all on all tables in schema realm_private from public, anon, authenticated;

create table if not exists public.realm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_path text,
  updated_at timestamptz not null default now(),
  constraint realm_profile_avatar_owned check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.webp$'))
);
create table if not exists public.realm_likes (
  resource_type text not null check (resource_type in ('mod', 'guide')),
  resource_id text not null check (char_length(resource_id) between 1 and 100 and resource_id ~ '^[a-z0-9]+([/-][a-z0-9]+)*$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_type, resource_id, user_id)
);
create table if not exists public.realm_comments (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('mod', 'guide')),
  resource_id text not null check (char_length(resource_id) between 1 and 100 and resource_id ~ '^[a-z0-9]+([/-][a-z0-9]+)*$'),
  author_id uuid not null references public.realm_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body, E' \n\r\t')) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hidden_at timestamptz
);
create index if not exists realm_comments_resource_page on public.realm_comments(resource_type, resource_id, created_at desc, id desc);
create index if not exists realm_comments_author on public.realm_comments(author_id);
alter table public.realm_profiles enable row level security;
alter table public.realm_likes enable row level security;
alter table public.realm_comments enable row level security;
revoke all on public.realm_profiles, public.realm_likes, public.realm_comments from public, anon, authenticated;
grant select on public.realm_profiles, public.realm_comments to anon, authenticated;
grant select on public.realm_likes to authenticated;

create or replace function public.realm_feedback_is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from realm_private.moderators where user_id = auth.uid());
$$;
drop policy if exists realm_comments_read on public.realm_comments;
create policy realm_comments_read on public.realm_comments for select to anon, authenticated
  using (hidden_at is null or author_id = auth.uid() or public.realm_feedback_is_moderator());
drop policy if exists realm_profiles_read on public.realm_profiles;
create policy realm_profiles_read on public.realm_profiles for select to anon, authenticated
  using (id = auth.uid() or public.realm_feedback_is_moderator() or exists(select 1 from public.realm_comments c where c.author_id = realm_profiles.id and c.hidden_at is null));
drop policy if exists realm_likes_read_own on public.realm_likes;
create policy realm_likes_read_own on public.realm_likes for select to authenticated using (user_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('realm-profile-photos', 'realm-profile-photos', false, 524288, array['image/webp'])
on conflict (id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id = 'realm-profile-photos' and (public or file_size_limit is distinct from 524288 or allowed_mime_types is distinct from array['image/webp'])) then
    raise exception 'The existing realm-profile-photos bucket has a different configuration. Review it before applying this migration.';
  end if;
end $$;

create or replace function realm_private.avatar_can_insert()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (select count(*) from storage.objects where bucket_id = 'realm-profile-photos' and (storage.foldername(name))[1] = auth.uid()::text) < 5;
$$;
revoke all on function realm_private.avatar_can_insert() from public, anon, authenticated;
grant usage on schema realm_private to authenticated;
grant execute on function realm_private.avatar_can_insert() to authenticated;
drop policy if exists realm_avatar_read on storage.objects;
create policy realm_avatar_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'realm-profile-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.realm_feedback_is_moderator() or
    exists(select 1 from public.realm_profiles p where p.avatar_path = objects.name and exists(select 1 from public.realm_comments c where c.author_id = p.id and c.hidden_at is null))
  )
);
drop policy if exists realm_avatar_insert on storage.objects;
create policy realm_avatar_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'realm-profile-photos' and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.webp$') and realm_private.avatar_can_insert()
);
drop policy if exists realm_avatar_delete on storage.objects;
create policy realm_avatar_delete on storage.objects for delete to authenticated using (
  bucket_id = 'realm-profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function realm_private.check_resource(p_type text, p_id text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_type is null or p_type not in ('mod', 'guide') or p_id is null or length(p_id) > 100 or p_id !~ '^[a-z0-9]+([/-][a-z0-9]+)*$' then
    raise exception 'Invalid resource' using errcode = '22023';
  end if;
end $$;

create or replace function realm_private.sync_profile(p_id uuid, p_create boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_data jsonb; v_name text; v_photo text;
begin
  if not p_create and not exists(select 1 from public.realm_profiles where id = p_id) then return; end if;
  select raw_user_meta_data -> 'realm_studios' into v_data from auth.users where id = p_id;
  v_name := left(coalesce(nullif(btrim(v_data ->> 'name'), ''), 'Adventurer'), 32);
  v_photo := v_data ->> 'photoPath';
  if v_photo is null or v_photo !~ ('^' || p_id::text || '/[0-9a-f-]{36}\.webp$') or not exists(select 1 from storage.objects where bucket_id = 'realm-profile-photos' and name = v_photo) then v_photo := null; end if;
  insert into public.realm_profiles(id, display_name, avatar_path) values(p_id, v_name, v_photo)
  on conflict(id) do update set display_name = excluded.display_name, avatar_path = excluded.avatar_path, updated_at = now();
end $$;
revoke all on function realm_private.check_resource(text,text), realm_private.sync_profile(uuid,boolean) from public, anon, authenticated;

create or replace function public.realm_feedback_sync_profile()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform realm_private.sync_profile(auth.uid(), false);
end $$;

create or replace function public.realm_feedback_summary(p_type text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform realm_private.check_resource(p_type, p_id);
  return jsonb_build_object(
    'likes', (select count(*) from public.realm_likes where resource_type = p_type and resource_id = p_id),
    'comments', (select count(*) from public.realm_comments where resource_type = p_type and resource_id = p_id and hidden_at is null),
    'liked', exists(select 1 from public.realm_likes where resource_type = p_type and resource_id = p_id and user_id = auth.uid()),
    'moderator', public.realm_feedback_is_moderator()
  );
end $$;

create or replace function public.realm_feedback_like(p_type text, p_id text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform realm_private.check_resource(p_type, p_id);
  if p_active is null then raise exception 'Invalid like state' using errcode = '22023'; end if;
  if p_active then
    insert into public.realm_likes(resource_type, resource_id, user_id) values(p_type, p_id, auth.uid()) on conflict do nothing;
  else
    delete from public.realm_likes where resource_type = p_type and resource_id = p_id and user_id = auth.uid();
  end if;
  return public.realm_feedback_summary(p_type, p_id);
end $$;

create or replace function public.realm_feedback_page(p_type text, p_id text, p_before_time timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb;
begin
  perform realm_private.check_resource(p_type, p_id);
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc, id desc), '[]'::jsonb) into v_items from (
    select c.id, c.body, c.author_id, p.display_name, p.avatar_path, c.created_at, c.updated_at,
      coalesce(c.author_id = auth.uid(), false) as can_edit,
      (coalesce(c.author_id = auth.uid(), false) or public.realm_feedback_is_moderator()) as can_delete,
      exists(select 1 from realm_private.moderators m where m.user_id = c.author_id) as moderator
    from public.realm_comments c join public.realm_profiles p on p.id = c.author_id
    where c.resource_type = p_type and c.resource_id = p_id and c.hidden_at is null
      and (p_before_time is null or (c.created_at, c.id) < (p_before_time, p_before_id))
    order by c.created_at desc, c.id desc limit 21
  ) page;
  return jsonb_build_object('items', v_items);
end $$;

create or replace function public.realm_feedback_comment_create(p_type text, p_id text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_allowed uuid; v_now timestamptz := statement_timestamp();
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  perform realm_private.check_resource(p_type, p_id);
  if p_body is null or char_length(btrim(p_body, E' \n\r\t')) not between 1 and 2000 then raise exception 'COMMENT_LENGTH' using errcode = '22023'; end if;
  insert into realm_private.comment_limits(user_id, last_post_at, post_day, posts_today) values(auth.uid(), v_now, current_date, 1)
  on conflict(user_id) do update set last_post_at = v_now, post_day = current_date,
    posts_today = case when realm_private.comment_limits.post_day = current_date then realm_private.comment_limits.posts_today + 1 else 1 end
  where realm_private.comment_limits.last_post_at <= v_now - interval '30 seconds'
    and (realm_private.comment_limits.post_day < current_date or realm_private.comment_limits.posts_today < 50)
  returning user_id into v_allowed;
  if v_allowed is null then raise exception 'COMMENT_RATE_LIMIT' using errcode = 'P0001'; end if;
  perform realm_private.sync_profile(auth.uid(), true);
  insert into public.realm_comments(resource_type, resource_id, author_id, body) values(p_type, p_id, auth.uid(), btrim(p_body, E' \n\r\t')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.realm_feedback_comment_edit(p_comment uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_body is null or char_length(btrim(p_body, E' \n\r\t')) not between 1 and 2000 then raise exception 'COMMENT_LENGTH' using errcode = '22023'; end if;
  update public.realm_comments set body = btrim(p_body, E' \n\r\t'), updated_at = now() where id = p_comment and author_id = auth.uid();
  if not found then raise exception 'Comment is not yours' using errcode = '42501'; end if;
end $$;

create or replace function public.realm_feedback_comment_delete(p_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  delete from public.realm_comments where id = p_comment and (author_id = auth.uid() or public.realm_feedback_is_moderator());
  if not found then raise exception 'Comment is not yours' using errcode = '42501'; end if;
end $$;

create or replace function public.realm_feedback_moderation(p_before_time timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb;
begin
  if not public.realm_feedback_is_moderator() then raise exception 'Moderator access required' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc, id desc), '[]'::jsonb) into v_items from (
    select c.id, c.resource_type, c.resource_id, c.author_id, c.body, c.created_at, c.updated_at, c.hidden_at, p.display_name, p.avatar_path
    from public.realm_comments c join public.realm_profiles p on p.id = c.author_id
    where p_before_time is null or (c.created_at, c.id) < (p_before_time, p_before_id)
    order by c.created_at desc, c.id desc limit 21
  ) page;
  return jsonb_build_object('items', v_items);
end $$;

create or replace function public.realm_feedback_set_hidden(p_comment uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.realm_feedback_is_moderator() then raise exception 'Moderator access required' using errcode = '42501'; end if;
  if p_hidden is null then raise exception 'Invalid hidden state' using errcode = '22023'; end if;
  update public.realm_comments set hidden_at = case when p_hidden then now() else null end where id = p_comment;
  if not found then raise exception 'Comment not found' using errcode = '22023'; end if;
end $$;

revoke all on function public.realm_feedback_is_moderator(), public.realm_feedback_summary(text,text), public.realm_feedback_page(text,text,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.realm_feedback_is_moderator(), public.realm_feedback_summary(text,text), public.realm_feedback_page(text,text,timestamptz,uuid) to anon, authenticated;
revoke all on function public.realm_feedback_sync_profile(), public.realm_feedback_like(text,text,boolean), public.realm_feedback_comment_create(text,text,text), public.realm_feedback_comment_edit(uuid,text), public.realm_feedback_comment_delete(uuid), public.realm_feedback_moderation(timestamptz,uuid), public.realm_feedback_set_hidden(uuid,boolean) from public, anon, authenticated;
grant execute on function public.realm_feedback_sync_profile(), public.realm_feedback_like(text,text,boolean), public.realm_feedback_comment_create(text,text,text), public.realm_feedback_comment_edit(uuid,text), public.realm_feedback_comment_delete(uuid), public.realm_feedback_moderation(timestamptz,uuid), public.realm_feedback_set_hidden(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
