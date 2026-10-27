import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Markdown releases generate detail pages, sort newest first, and exclude drafts', async () => {
  const directory = new URL('../src/content/changelog/', import.meta.url);
  // Keep output on the checkout's filesystem: Astro moves build assets by rename.
  const temporaryRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const output = await mkdtemp(join(temporaryRoot, 'content-'));
  const nonce = `integration-${process.pid}`;
  const created = [];
  try {
    for (const [suffix, date, draft] of [['older', '2025-01-01', false], ['newer', '2025-01-02', false], ['draft', '2025-01-03', true]]) {
      const name = `${nonce}-${suffix}`;
      const file = new URL(`${name}.md`, directory);
      await writeFile(file, `---\ntitle: "${name}"\nversion: "test-${suffix}"\ndate: ${date}\nsummary: "Integration test fixture, never published."\ndraft: ${draft}\n---\n\n## Added\n\nA **rendered** changelog entry.\n`, { flag: 'wx' });
      created.push(file);
    }
    const result = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', output], { cwd: new URL('../', import.meta.url), env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', SITE_URL: 'https://example.test' }, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const listing = await readFile(join(output, 'modpack/changelog/index.html'), 'utf8');
    assert(listing.indexOf(`${nonce}-newer`) < listing.indexOf(`${nonce}-older`));
    assert(!listing.includes(`${nonce}-draft`));
    const detail = await readFile(join(output, `modpack/changelog/${nonce}-newer/index.html`), 'utf8');
    assert.match(detail, /<strong>rendered<\/strong>/);
    await assert.rejects(access(join(output, `modpack/changelog/${nonce}-draft/index.html`)));
    const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
    assert(sitemap.includes(`https://example.test/modpack/changelog/${nonce}-newer/`));
    assert(!sitemap.includes(`${nonce}-draft`));
    assert.match(await readFile(join(output, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example.test\/sitemap.xml/);
  } finally {
    for (const file of created) await rm(file);
    await rm(output, { recursive: true, force: true });
  }
});
