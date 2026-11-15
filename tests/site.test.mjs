import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const files = (await readdir(root, { recursive: true })).filter(path => path.endsWith('.html'));
const documents = await Promise.all(files.filter(file => !file.startsWith('admin/')).map(async file => [file, await readFile(join(root, file), 'utf8')]));

test('every mod and wiki guide has a generated page', async () => {
  const source = JSON.parse(await readFile(new URL('../src/data/mods.json', import.meta.url), 'utf8'));
  const slugs = source.mods.map(mod => mod.slug);
  assert(slugs.length > 0);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    await access(join(root, 'mods', slug, 'index.html'));
    await access(join(root, 'wiki', slug, 'index.html'));
  }
  await access(join(root, 'wiki/installation/index.html'));
  assert(files.length >= slugs.length * 2 + 6);
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


test('production metadata uses the canonical domain and the CMS home content is rendered', async () => {
  const home = JSON.parse(await readFile(new URL('../src/data/home.json', import.meta.url), 'utf8'));
  const html = await readFile(join(root, 'index.html'), 'utf8');
  for (const key of ['heroTitle','heroEmphasis','heroPrimary','heroSecondary','collectionTitle','wikiTitle','seasonTitle']) assert(html.includes(home[key]), key);
  for (const [file, document] of documents) {
    assert(document.includes('rel="canonical" href="https://realmstudios.pt/'), file);
    assert(!document.includes('pages.dev'), file);
  }
  assert((await readFile(join(root,'sitemap.xml'),'utf8')).includes('https://realmstudios.pt/mods/realm-gym/'));
  assert((await readFile(join(root,'robots.txt'),'utf8')).includes('Sitemap: https://realmstudios.pt/sitemap.xml'));
});

test('mod pages expose actual screenshots and separate loader downloads', async () => {
  const gym = await readFile(join(root, 'mods/realm-gym/index.html'), 'utf8');
  assert(gym.includes('gameplay-section'));assert(gym.includes('<video'));assert(gym.includes('Realm Gym'));
  const cards = gym.match(/<article class="download-card">[\s\S]*?<\/article>/g); assert.equal(cards.length, 4);
  const fabric = cards.find(card => card.includes('<h3>Fabric')); assert(fabric.includes('Fabric API 0.116.18+1.21.1')); assert(fabric.includes('realm-gym-0.7.1-fabric-1.21.1.jar'));
  assert(!cards.find(card => card.includes('<h3>NeoForge')).includes('Fabric API')); assert(cards.find(card => card.includes('<h3>Forge') && card.includes('Minecraft 1.20.1')).includes('Includes six machines'));
  const forge211 = cards.find(card => card.includes('<h3>Forge') && card.includes('Minecraft 1.21.1')); assert(forge211.includes('realm-gym-0.7.1-forge-1.21.1.jar')); assert(forge211.includes('Forge 52.1.20+')); assert(forge211.includes('Java 21')); assert(!forge211.includes('Fabric API'));
  const contracts = await readFile(join(root, 'mods/contracts-bounties/index.html'), 'utf8');
  assert(contracts.includes('Forge · Minecraft 1.20.1'));assert(contracts.includes('Download Forge'));assert(contracts.includes('Download NeoForge'));
});

test('account pages stay out of public search and preserve the protected CMS backend', async () => {
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert(!sitemap.includes('/account/'));
  for (const file of ['account/index.html', 'account/reset/index.html']) {
    const html = await readFile(join(root, file), 'utf8');
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert(html.includes('data-pagefind-ignore'));
  }
  const account = await readFile(join(root, 'account/index.html'), 'utf8');
  assert(account.includes('href="/admin/"'));
  const config = await readFile(new URL('../public/admin/config.yml', import.meta.url), 'utf8');
  assert(config.includes('realm-studios-admin-auth.rockabits2007.workers.dev'));
  const worker = await readFile(new URL('../admin-auth/src/index.ts', import.meta.url), 'utf8');
  assert(worker.includes('ALLOWED_GITHUB_LOGIN'));
});
