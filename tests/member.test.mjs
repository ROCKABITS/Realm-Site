import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseMember, applyMemberOperation, compatibleEditions, unreadEditions, currentReleases, safeReturnPath } from '../src/lib/member-model.ts';

const editions = [{ id: 'neoforge-1.21.1', version: '0.4.1', minecraft: '1.21.1', loader: 'NeoForge', downloadUrl: 'https://example.test/neo.jar' }, { id: 'forge-1.20.1', version: '0.4.1', minecraft: '1.20.1', loader: 'Forge', downloadUrl: 'https://example.test/forge.jar' }];
const mod = { slug: 'contracts-bounties', name: 'Contracts', editions };

test('untrusted metadata is normalised without granting roles or accepting image URLs', () => {
  const state = normaliseMember({ role: 'admin', realm_studios: { name: 'A'.repeat(100), avatar: 'https://bad.test/image', favoriteMods: ['realm-gym', 'realm-gym', '../admin', '<script>'], favoriteGuides: null, follows: { '../escape': {}, 'realm-gym': { seen: { 'neoforge-1.21.1': 99 } } }, setup: { loader: 'admin', minecraft: '<script>' } } });
  assert.equal(state.name.length, 32); assert.equal(state.avatar, 'spark'); assert.deepEqual(state.favoriteMods, ['realm-gym']); assert.deepEqual(state.setup, { loader: '', minecraft: '' }); assert(!('role' in state));
  assert.deepEqual(Object.keys(state.follows), ['realm-gym']); assert.deepEqual(state.follows['realm-gym'].seen, {});
});

test('profile edits preserve saved items and following state', () => {
  const original = normaliseMember({ realm_studios: { favoriteMods: ['realm-gym'], favoriteGuides: ['installation'], follows: { 'realm-gym': { seen: { neo: '1.0.0' } } } } });
  const next = applyMemberOperation(original, { type: 'profile', name: 'Olá 👋', avatar: 'leaf', setup: { loader: 'Forge', minecraft: '1.20.1' } });
  assert.deepEqual(next.favoriteMods, original.favoriteMods); assert.deepEqual(next.follows, original.follows); assert.equal(next.name, 'Olá 👋'); assert.equal(original.name, '');
});

test('saved-item actions are idempotent and do not mutate the prior snapshot', () => {
  const original = normaliseMember({});
  const once = applyMemberOperation(original, { type: 'favorite-mod', id: 'realm-gym', active: true });
  const twice = applyMemberOperation(once, { type: 'favorite-mod', id: 'realm-gym', active: true });
  assert.deepEqual(twice.favoriteMods, ['realm-gym']); assert.deepEqual(original.favoriteMods, []);
  assert.deepEqual(applyMemberOperation(twice, { type: 'favorite-mod', id: 'realm-gym', active: false }).favoriteMods, []);
});

test('following starts caught up and tracks updates independently by loader edition', () => {
  const followed = applyMemberOperation(normaliseMember({}), { type: 'follow', id: mod.slug, active: true, releases: currentReleases(editions) });
  assert.deepEqual(unreadEditions(followed, mod), []);
  const update = { ...mod, editions: [editions[0], { ...editions[1], version: '0.5.0' }] };
  assert.deepEqual(unreadEditions(followed, update).map(edition => edition.loader), ['Forge']);
  const read = applyMemberOperation(followed, { type: 'read', id: mod.slug, releases: currentReleases(update.editions) });
  assert.deepEqual(unreadEditions(read, update), []);
  assert.deepEqual(applyMemberOperation(read, { type: 'follow', id: mod.slug, active: false, releases: {} }).follows, {});
});

test('compatibility requires Minecraft and loader to match the same edition', () => {
  assert.deepEqual(compatibleEditions({ minecraft: '1.21.1', loader: 'Forge' }, editions), []);
  assert.deepEqual(compatibleEditions({ minecraft: '1.20.1', loader: 'Forge' }, editions).map(edition => edition.id), ['forge-1.20.1']);
  assert.equal(compatibleEditions({ minecraft: '', loader: '' }, editions).length, 2);
});

test('login return paths stay on published mod and guide routes', () => {
  assert.equal(safeReturnPath('/mods/realm-gym/'), '/mods/realm-gym/');
  for (const path of ['//evil.test/', 'https://evil.test/', '/admin/', '/wiki/../../admin/', '/\\evil.test/', '/mods/%2e%2e/', '%ZZ']) assert.equal(safeReturnPath(path), undefined, path);
});
