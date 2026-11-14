import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = '00000000-0000-4000-8000-000000000001', bob = '00000000-0000-4000-8000-000000000002', mod = '00000000-0000-4000-8000-000000000003';
const folder = new URL('../supabase/migrations/', import.meta.url);
const migration = (await Promise.all((await readdir(folder)).filter(name => name.endsWith('.sql')).sort().map(name => readFile(new URL(name, folder), 'utf8')))).join('\n');
const bootstrap = `
  create role anon; create role authenticated;
  create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
  create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(regexp_replace(name,'/[^/]*$',''),'/')$$;
  alter table storage.objects enable row level security;
  grant usage on schema public,storage to anon,authenticated;
  grant select,insert,update,delete on storage.objects to anon,authenticated;
`;

test('community migration enforces PostgreSQL privileges, row policies and ownership', async t => {
  const db = new PGlite();
  await db.exec(bootstrap); await db.exec(migration);
  for (const [id, name] of [[alice, 'Alice'], [bob, 'Bob'], [mod, 'Moderator']]) await db.query('insert into auth.users values($1,$2,$3)', [id, `${name}@example.test`, { realm_studios: { name }, role: 'admin' }]);
  await db.query('insert into realm_private.moderators values($1)', [mod]);
  async function as(id, sql, params = []) {
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']); await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
    try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
  }
  let comment;
  try {
    await t.test('anonymous visitors can read totals but cannot like or post', async () => {
      assert.deepEqual((await as(null, "select realm_feedback_summary('mod','realm-gym') as result"))[0].result, { likes: 0, comments: 0, liked: false, moderator: false });
      await assert.rejects(as(null, "select realm_feedback_like('mod','realm-gym',true)"), /permission denied|Sign in required/);
      await assert.rejects(as(null, "select realm_feedback_comment_create('mod','realm-gym','Hello')"), /permission denied|Sign in required/);
    });
    await t.test('likes are unique and another user cannot remove them', async () => {
      await as(alice, "select realm_feedback_like('mod','realm-gym',true)"); await as(alice, "select realm_feedback_like('mod','realm-gym',true)");
      assert.equal((await as(null, "select realm_feedback_summary('mod','realm-gym') as result"))[0].result.likes, 1);
      await as(bob, "select realm_feedback_like('mod','realm-gym',false)");
      assert.equal((await as(alice, 'select * from realm_likes')).length, 1); assert.equal((await as(bob, 'select * from realm_likes')).length, 0);
      await assert.rejects(as(bob, 'delete from realm_likes'), /permission denied/);
    });
    await t.test('unpublished profile names and photos are private', async () => {
      const path = `${alice}/11111111-1111-4111-8111-111111111111.webp`;
      await as(alice, "insert into storage.objects(bucket_id,name) values('realm-profile-photos',$1)", [path]);
      await db.query("update auth.users set raw_user_meta_data=jsonb_set(raw_user_meta_data,'{realm_studios,photoPath}',to_jsonb($2::text)) where id=$1", [alice, path]);
      assert.equal((await as(null, 'select * from storage.objects')).length, 0);
      assert.equal((await as(bob, 'select * from storage.objects')).length, 0);
      await as(alice, 'select realm_feedback_sync_profile()'); assert.equal((await as(null, 'select * from realm_profiles')).length, 0);
      await assert.rejects(as(bob, 'select realm_private.sync_profile($1,true)', [alice]), /permission denied/);
      await assert.rejects(as(bob, 'insert into realm_private.moderators values($1)', [bob]), /permission denied/);
      assert.equal((await as(bob, 'select realm_feedback_is_moderator() as result'))[0].result, false);
    });
    await t.test('posting publishes only the selected identity and enforces content/rate limits', async () => {
      comment = (await as(alice, "select realm_feedback_comment_create('mod','realm-gym','Great mod!') as id"))[0].id;
      const page = (await as(null, "select realm_feedback_page('mod','realm-gym') as page"))[0].page;
      assert.equal(page.items[0].display_name, 'Alice'); assert.equal(page.items[0].can_edit, false); assert.equal(page.items[0].moderator, false);
      assert(!JSON.stringify(page).includes('example.test')); assert(!JSON.stringify(page).includes('raw_user_meta_data'));
      assert.equal((await as(null, 'select * from realm_profiles')).length, 1); assert.equal((await as(null, 'select * from storage.objects')).length, 1);
      await assert.rejects(as(alice, "select realm_feedback_comment_create('mod','realm-gym','Again')"), /COMMENT_RATE_LIMIT/);
      await assert.rejects(as(bob, "select realm_feedback_comment_create('mod','realm-gym',E' \n\t')"), /COMMENT_LENGTH/);
      await assert.rejects(as(bob, "select realm_feedback_comment_create('mod','realm-gym',$1)", ['x'.repeat(2001)]), /COMMENT_LENGTH/);
    });
    await t.test('only an author can edit their comment and its author/resource cannot be forged', async () => {
      await assert.rejects(as(bob, 'select realm_feedback_comment_edit($1,$2)', [comment, 'Forged']), /not yours/);
      await assert.rejects(as(bob, 'update realm_comments set author_id=$1', [bob]), /permission denied/);
      await as(alice, 'select realm_feedback_comment_edit($1,$2)', [comment, 'Updated feedback']);
      assert.equal((await as(null, "select realm_feedback_page('mod','realm-gym') as page"))[0].page.items[0].body, 'Updated feedback');
    });
    await t.test('moderation comes from the protected role table, not user metadata', async () => {
      await assert.rejects(as(bob, 'select realm_feedback_set_hidden($1,true)', [comment]), /Moderator access/);
      await as(mod, 'select realm_feedback_set_hidden($1,true)', [comment]);
      assert.equal((await as(null, "select realm_feedback_page('mod','realm-gym') as page"))[0].page.items.length, 0);
      assert.equal((await as(null, 'select * from realm_profiles')).length, 0); assert.equal((await as(null, 'select * from storage.objects')).length, 0);
      assert.equal((await as(mod, 'select realm_feedback_moderation() as page'))[0].page.items.length, 1);
      await as(mod, 'select realm_feedback_set_hidden($1,false)', [comment]);
    });
    await t.test('photos cannot be written or deleted outside the authenticated user folder', async () => {
      await assert.rejects(as(bob, "insert into storage.objects(bucket_id,name) values('realm-profile-photos',$1)", [`${alice}/22222222-2222-4222-8222-222222222222.webp`]), /row-level security/);
      await as(bob, 'delete from storage.objects where name like $1', [`${alice}/%`]);
      assert.equal((await as(alice, 'select * from storage.objects')).length, 1);
      await assert.rejects(as(alice, "insert into storage.objects(bucket_id,name) values('realm-profile-photos',$1)", [`${alice}/script.svg`]), /row-level security/);
    });
    await t.test('public endpoints use invoker privileges and private tables reject direct access', async () => {
      assert.equal((await db.query("select count(*)::int as total from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'realm_feedback_%' and p.prosecdef")).rows[0].total, 0);
      await assert.rejects(as(bob, 'select * from realm_private.moderators'), /permission denied/);
      await assert.rejects(as(bob, 'update realm_private.comment_limits set posts_today=0'), /permission denied/);
    });
    await t.test('daily rate limits survive deletion and reset on a later UTC day', async () => {
      await db.query("update realm_private.comment_limits set last_post_at=now()-interval '1 minute',posts_today=50 where user_id=$1", [alice]);
      await assert.rejects(as(alice, "select realm_feedback_comment_create('guide','installation','Daily limit')"), /COMMENT_RATE_LIMIT/);
      await db.query("update realm_private.comment_limits set post_day=current_date-1 where user_id=$1", [alice]);
      const extra = (await as(alice, "select realm_feedback_comment_create('guide','installation','A new day') as id"))[0].id;
      await as(alice, 'select realm_feedback_comment_delete($1)', [extra]);
      await assert.rejects(as(alice, "select realm_feedback_comment_create('guide','installation','Immediate repost')"), /COMMENT_RATE_LIMIT/);
    });
    await t.test('reapplying the migration preserves existing feedback', async () => {
      await db.exec(migration);
      assert.equal((await as(null, "select realm_feedback_summary('mod','realm-gym') as result"))[0].result.comments, 1);
      await as(alice, 'select realm_feedback_comment_delete($1)', [comment]);
      assert.equal((await as(null, "select realm_feedback_summary('mod','realm-gym') as result"))[0].result.comments, 0);
    });
  } finally { await db.close(); }
});
