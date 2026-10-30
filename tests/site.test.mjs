import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const files = (await readdir(root, { recursive: true })).filter(path => path.endsWith('.html'));
const documents = await Promise.all(files.map(async file => [file, await readFile(join(root, file), 'utf8')]));

test('every mod and wiki guide has a generated page', async () => {
  const source = JSON.parse(await readFile(new URL('../src/data/mods.json', import.meta.url), 'utf8'));
  const slugs = source.mods.map(mod => mod.slug);
  assert.equal(slugs.length, 13);
  for (const slug of slugs) {
    await access(join(root, 'mods', slug, 'index.html'));
    await access(join(root, 'wiki', slug, 'index.html'));
  }
  await access(join(root, 'wiki/installation/index.html'));
  assert.equal(files.length, 34);
});

test('internal links, image sources, scripts and fragment targets resolve', async () => {
  const failures = [];
  for (const [file, html] of documents) {
    const currentUrl = file === 'index.html' ? '/' : file.replace(/index\.html$/, '');
    for (const match of html.matchAll(/<(?:a|link|script|img)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
      const raw = match[1].replaceAll('&amp;', '&');
      if (/^(?:https?:|mailto:|data:|tel:)/.test(raw)) continue;
      const url = new URL(raw, `https://test.invalid/${currentUrl}`);
      let path = decodeURIComponent(url.pathname).slice(1);
      if (!extname(path)) path = `${path.replace(/\/$/, '')}${path ? '/' : ''}index.html`;
      try {
        await access(join(root, path));
        if (url.hash && path.endsWith('.html')) {
          const target = await readFile(join(root, path), 'utf8');
          const id = decodeURIComponent(url.hash.slice(1));
          assert(target.includes(`id="${id}"`), `Missing #${id}`);
        }
      } catch (error) { failures.push(`${file}: ${raw} (${error.message})`); }
    }
  }
  assert.deepEqual(failures, []);
});

test('pages have English metadata, one h1, descriptions, and unique titles', () => {
  const titles = [];
  for (const [file, html] of documents) {
    assert.match(html, /<html lang="en"/, file);
    assert.match(html, /<meta name="description" content="[^"]+"/, file);
    assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length, 1, file);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert(title, file);
    titles.push(title);
  }
  assert.equal(new Set(titles).size, titles.length);
});

test('draft release content is hidden and the changelog matches published releases', async () => {
  for (const [file, html] of documents) {
    assert(!html.includes('YOUR-VERSION'), file);
    assert(!html.includes('Draft template'), file);
  }
  assert(!(await readFile(join(root, 'sitemap.xml'), 'utf8')).includes('first-release'));
  await access(join(root, 'pagefind/pagefind.js'));

  const changelog = documents.find(([file]) => file === 'modpack/changelog/index.html')?.[1];
  assert(changelog, 'modpack changelog page should exist');
  const firstReleaseLink = changelog.match(/href="(\/modpack\/changelog\/[^"]+\/)"/);
  if (firstReleaseLink) {
    const detailPath = firstReleaseLink[1].replace(/^\//, '') + 'index.html';
    await access(join(root, detailPath));
    assert(!changelog.includes('No release notes yet'));
  } else {
    assert.match(changelog, /No release notes yet/);
  }
});
