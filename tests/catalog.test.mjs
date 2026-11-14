import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareVersions, selectRelease, normalizeRelease } from '../scripts/releases.mjs';
const read = async name => JSON.parse(await readFile(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));
test('release selection uses semantic versions and keeps loader editions separate', () => {
  const paths = ['mod-pronto/contracts-bounties-0.9.0.jar', 'mod-pronto/contracts-bounties-0.10.0.jar', 'mod-pronto/contracts-bounties-0.11.0-forge-1.20.1.jar'];
  assert(compareVersions('0.10.0', '0.9.0') > 0);
  assert.equal(selectRelease(paths, { prefix: 'contracts-bounties' }).version, '0.10.0');
  assert.equal(selectRelease(paths, { prefix: 'contracts-bounties', suffix: '-forge-1.20.1' }).version, '0.11.0');
  assert.equal(selectRelease(paths, { prefix: 'missing' }), undefined);
});
test('download metadata is pinned to a release and keeps edition requirements', () => {
  const commit = 'a'.repeat(40), source = 'b'.repeat(40);
  const edition = { id: 'forge-1.20.1', loader: 'Forge', loaderVersion: '47.4.0+', minecraft: '1.20.1', java: 17 };
  const r = normalizeRelease({ path: 'mod-pronto/mod-0.4.1-forge-1.20.1.jar', version: '0.4.1' }, edition, { source_commit: source }, commit, 'forge-port');
  assert.equal(r.minecraft, '1.20.1');assert.equal(r.java, 17);assert.equal(r.loader, 'Forge');assert.equal(r.status, null);
  assert(r.downloadUrl.includes(`/raw/${commit}/`));assert(r.sourceUrl.includes(`/tree/${source}/forge-port`));
});
test('every editorial mod has unique, complete release metadata', async () => {
  const editorial = await read('mods.json'), releases = await read('releases.json'), sources = await read('catalog-sources.json');
  const slugs = editorial.mods.map(x => x.slug);assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual(releases.mods.map(x => x.slug).sort(), [...slugs].sort());
  assert.deepEqual(sources.mods.map(x => x.slug).sort(), [...slugs].sort());
  for (const m of releases.mods) { assert(m.editions.length); for (const e of m.editions) { assert(e.version && e.minecraft && e.loader && e.java && e.jar);assert(e.downloadUrl.includes(releases.releaseCommit)); } }
  const forge = releases.mods.find(x => x.slug === 'contracts-bounties').editions.find(x => x.loader === 'Forge');assert.equal(forge.minecraft, '1.20.1');assert.equal(forge.java, 17);
  assert(releases.mods.some(x => x.slug === 'realm-gym'));
});

test('Realm Gym selects NeoForge, Fabric and Forge releases independently', () => {
  const paths = ['mod-pronto/realm-gym-0.5.1.jar', 'mod-pronto/realm-gym-0.6.0.jar', 'mod-pronto/realm-gym-0.6.0-fabric-1.21.1.jar', 'mod-pronto/realm-gym-0.5.1-forge-1.20.1.jar'];
  assert.equal(selectRelease(paths, { prefix: 'realm-gym' }).version, '0.6.0');
  assert.equal(selectRelease(paths, { prefix: 'realm-gym', suffix: '-fabric-1.21.1' }).path, 'mod-pronto/realm-gym-0.6.0-fabric-1.21.1.jar');
  assert.equal(selectRelease(paths, { prefix: 'realm-gym', suffix: '-forge-1.20.1' }).version, '0.5.1');
});
test('Fabric metadata supplies its loader version and edition-specific API requirement', () => {
  const commit = 'c'.repeat(40);
  const edition = { id: 'fabric-1.21.1', loader: 'Fabric', loaderVersion: '0.16.14+', minecraft: '1.21.1', java: 21, dependencies: [{ name: 'Fabric API', version: 'old', url: 'https://www.curseforge.com/minecraft/mc-mods/fabric-api' }] };
  const release = { path: 'mod-pronto/realm-gym-0.6.0-fabric-1.21.1.jar', version: '0.6.0' };
  const result = normalizeRelease(release, edition, { fabric_loader: '0.16.14', fabric_api: '0.116.18+1.21.1', source_commit: commit }, commit, 'realm-gym-fabric-1.21.1');
  assert.equal(result.loaderVersion, '0.16.14+'); assert.equal(result.dependencies[0].version, '0.116.18+1.21.1'); assert.equal(result.java, 21);
  const neo = normalizeRelease(release, { id: 'neo', loader: 'NeoForge', loaderVersion: '21.1.256+', minecraft: '1.21.1', java: 21 }, { neoforge: '21.1.256' }, commit, 'realm-gym');
  assert.equal(neo.dependencies, undefined);
});
