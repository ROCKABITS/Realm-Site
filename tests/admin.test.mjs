import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readArticle, writeArticle, updateMod, encodeContent, decodeContent, makeSlug, validDate, validateArticle } from '../src/admin/content.ts';

test('article edits preserve additional frontmatter and Markdown tables', () => {
  const input = '---\r\ntitle: Guia\r\ncategory: Getting started\r\ncustom:\r\n  nested: [one, two]\r\n---\r\n\r\n| Coluna |\n| --- |\n| Valor |\n\n---\n\nUma separação no conteúdo.\n';
  const article = readArticle(input); article.data.title = 'Título: com caracteres especiais';
  assert.deepEqual(readArticle(writeArticle(article)), article);
  assert.deepEqual(article.data.custom, { nested: ['one', 'two'] });
  assert.match(article.body, /\n---\n/);
});

test('invalid metadata cannot silently become an empty article', () => {
  assert.throws(() => readArticle('No metadata\n\nContent'));
  assert.throws(() => readArticle('---\n- an array\n---\nContent'));
});

test('saving one mod preserves other mods, unknown fields and its route', () => {
  const source = { retained: true, mods: [{ slug: 'one', name: 'One', extra: { keep: true } }, { slug: 'two', name: 'Two' }] };
  const updated = updateMod(source, 'one', { name: 'Novo nome', slug: 'changed' });
  assert.equal(updated.mods[0].slug, 'one'); assert.deepEqual(updated.mods[0].extra, { keep: true });
  assert.deepEqual(updated.mods[1], source.mods[1]); assert.equal(source.mods[0].name, 'One'); assert.equal(updated.retained, true);
  assert.throws(() => updateMod(source, 'missing', {}));
});

test('GitHub content encoding round-trips Unicode without corrupting accents', () => {
  const text = 'Olá 👋\nAção, ginásio, português e 日本語.';
  assert.equal(decodeContent(encodeContent(text)), text);
});

test('new page slugs and release dates are safe and valid', () => {
  assert.equal(makeSlug('Instalação: Realm Gym!'), 'instalacao-realm-gym');
  assert.equal(makeSlug('../../Olá? #Guia'), 'ola-guia');
  assert(validDate('2024-02-29')); assert(!validDate('2026-02-29')); assert(!validDate('2026-13-01')); assert(!validDate('invalid'));
});

test('a draft still needs valid content and compatible metadata', () => {
  assert(validateArticle('wiki', { data: { title: 'Guide', description: 'Description', category: 'Unknown', order: 1, draft: true }, body: 'Body' }));
  assert.equal(validateArticle('wiki', { data: { title: 'Guide', description: 'Description', category: 'Getting started', order: 50, draft: true }, body: 'Body' }), undefined);
  assert(validateArticle('changelog', { data: { title: 'Release', version: '1.0.0', summary: 'Summary', date: '2026-02-30' }, body: 'Body' }));
});
