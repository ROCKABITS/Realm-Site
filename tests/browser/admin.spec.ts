import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { authServer } from './fixtures/member-auth';

const owner = { login: 'ROCKABITS' }; const token = 'fixture-admin-token';
type Write = { path: string; body: any; text: string };
function fixtureData() {
  const documents: Record<string, string> = {};
  for (const path of ['src/data/mods.json', 'src/data/home.json', 'src/data/site.json', 'src/data/releases.json']) documents[path] = readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  for (const kind of ['wiki', 'changelog']) for (const name of readdirSync(new URL(`../../src/content/${kind}/`, import.meta.url))) if (name.endsWith('.md')) documents[`src/content/${kind}/${name}`] = readFileSync(new URL(`../../src/content/${kind}/${name}`, import.meta.url), 'utf8');
  return documents;
}
const sha = (text: string) => createHash('sha1').update(text).digest('hex');
async function mockAdmin(page: Page, options: { signedIn?: boolean; wrongOwner?: boolean; conflict?: boolean; failedBuild?: boolean } = {}) {
  const documents = fixtureData(); const writes: Write[] = []; const requests: string[] = [];
  await page.route('https://api.github.com/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    requests.push(path);
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (path === '/user') return route.fulfill({ headers, json: options.wrongOwner ? { login: 'visitor' } : owner });
    const base = '/repos/ROCKABITS/Realm-Site/contents/';
    if (path.startsWith(base)) {
      const file = decodeURIComponent(path.slice(base.length));
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); const text = Buffer.from(body.content, 'base64').toString('utf8');
        writes.push({ path: file, body, text });
        if (options.conflict) return route.fulfill({ status: 409, headers, json: { message: 'SHA conflict' } });
        if (documents[file] && body.sha !== sha(documents[file])) return route.fulfill({ status: 409, headers, json: {} });
        documents[file] = text;
        return route.fulfill({ headers, json: { content: { sha: sha(text) }, commit: { sha: 'a'.repeat(40) } } });
      }
      if (documents[file] !== undefined) return route.fulfill({ headers, json: { path: file, sha: sha(documents[file]), content: Buffer.from(documents[file]).toString('base64') } });
      if (file === 'src/content/wiki' || file === 'src/content/changelog') return route.fulfill({ headers, json: Object.keys(documents).filter(key => key.startsWith(file + '/')).map(key => ({ path: key, name: key.split('/').pop(), type: 'file', sha: sha(documents[key]) })) });
    }
    if (/\/commits\/[^/]+\/check-runs$/.test(path)) return route.fulfill({ headers, json: { check_runs: [{ name: 'validate', status: 'completed', conclusion: options.failedBuild ? 'failure' : 'success' }, { name: 'Cloudflare Pages', status: 'completed', conclusion: 'success' }] } });
    if (path.endsWith('/commits')) return route.fulfill({ headers, json: [{ sha: 'b'.repeat(40), commit: { message: 'Atualizar guia Realm Gym', author: { date: '2026-11-13T12:00:00Z' } } }] });
    return route.fulfill({ status: 404, headers, json: { message: 'Unmocked endpoint' } });
  });
  if (options.signedIn !== false) await page.addInitScript(value => sessionStorage.setItem('realm-studios-admin-session', value), token);
  return { documents, writes, requests };
}
async function open(page: Page, route = '') { await page.goto(`/admin/#/${route}`); await expect(page.locator('#admin-app')).toBeVisible(); await expect(page.locator('#admin-view h1')).toBeVisible(); }

test('admin login accepts only its OAuth popup and verifies the allowed GitHub account', async ({ page }) => {
  const mock = await mockAdmin(page, { signedIn: false });
  await page.goto('/admin/'); await expect(page.getByRole('button', { name: 'Entrar com GitHub' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://realm-studios-admin-auth.rockabits2007.workers.dev', source: window, data: 'authorization:github:success:{"token":"spoofed","provider":"github"}' })));
  expect(mock.requests).toEqual([]); await expect(page.locator('#admin-app')).toBeHidden();
  await page.context().route('https://realm-studios-admin-auth.rockabits2007.workers.dev/auth', route => route.fulfill({ contentType: 'text/html', body: `<script>window.addEventListener('message',e=>{if(e.origin==='http://127.0.0.1:4321')window.opener.postMessage('authorization:github:success:'+JSON.stringify({token:'fixture-admin-token',provider:'github'}),e.origin)});window.opener.postMessage('authorizing:github','http://127.0.0.1:4321');</script>` }));
  await page.getByRole('button', { name: 'Entrar com GitHub' }).click();
  await expect(page.locator('#admin-app')).toBeVisible(); expect(mock.requests[0]).toBe('/user');
  await page.getByRole('button', { name: 'Terminar sessão' }).click();
  await expect(page.locator('#admin-login')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('realm-studios-admin-session'))).toBeNull();
});

test('a visitor cannot open the editor with an unapproved GitHub identity', async ({ page }) => {
  const mock = await mockAdmin(page, { wrongOwner: true });
  await page.goto('/admin/#/mods');
  await expect(page.locator('#login-status')).toContainText('não tem acesso');
  await expect(page.locator('#admin-app')).toBeHidden(); expect(mock.requests).toEqual(['/user']); expect(mock.writes).toHaveLength(0);
});

test('mods are individual searchable cards and saving one preserves every other mod', async ({ page }) => {
  const mock = await mockAdmin(page); const original = JSON.parse(mock.documents['src/data/mods.json']);
  await open(page, 'mods'); await expect(page.locator('.studio-mod')).toHaveCount(original.mods.length);
  await page.getByRole('searchbox', { name: 'Pesquisar mods…' }).fill('gym'); await expect(page.locator('.studio-mod:visible')).toHaveCount(1);
  await page.locator('.studio-mod:visible').click(); await page.getByLabel('Descrição curta', { exact: true }).fill('A new description with treino e ação.');
  await expect(page.locator('#editor-preview-body')).toContainText('treino e ação');
  await page.getByRole('button', { name: 'Guardar e publicar' }).click();
  await expect(page.locator('#publication-status')).toContainText('Publicado');
  expect(mock.writes).toHaveLength(1); const saved = JSON.parse(mock.writes[0].text);
  expect(mock.writes[0].body.branch).toBe('realm-studios-site'); expect(mock.writes[0].body.sha).toBe(sha(JSON.stringify(original, null, 2) + '\n'));
  expect(saved.mods.filter((mod: any) => mod.slug !== 'realm-gym')).toEqual(original.mods.filter((mod: any) => mod.slug !== 'realm-gym'));
  expect(saved.mods.find((mod: any) => mod.slug === 'realm-gym').description).toContain('treino e ação');
});

test('navigation guards unsaved work and a reload restores the local draft', async ({ page }) => {
  await mockAdmin(page); await open(page, 'mods/realm-gym');
  await page.getByLabel('Nome do mod', { exact: true }).fill('Um nome por guardar');
  await page.getByRole('navigation', { name: 'Administração' }).getByRole('link', { name: 'Guias da wiki' }).click();
  await expect(page.getByRole('dialog', { name: '' })).toBeVisible(); await page.getByRole('button', { name: 'Continuar a editar' }).click();
  await expect(page.getByLabel('Nome do mod', { exact: true })).toHaveValue('Um nome por guardar');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await expect(page.getByLabel('Nome do mod', { exact: true })).toHaveValue('Um nome por guardar');
  await expect(page.locator('#editor-notice')).toContainText('Recuperámos');
  await page.getByRole('navigation', { name: 'Administração' }).getByRole('link', { name: 'Guias da wiki' }).click();
  await page.getByRole('button', { name: 'Descartar alterações' }).click(); await expect(page).toHaveURL(/#\/wiki$/);
});

test('a concurrent edit preserves the input and reports the conflict', async ({ page }) => {
  const mock = await mockAdmin(page, { conflict: true }); await open(page, 'mods/realm-gym');
  await page.getByLabel('Nome do mod', { exact: true }).fill('Texto preservado'); await page.getByRole('button', { name: 'Guardar e publicar' }).click();
  await expect(page.locator('#editor-notice')).toContainText('O teu texto foi mantido');
  await expect(page.getByLabel('Nome do mod', { exact: true })).toHaveValue('Texto preservado'); expect(mock.writes).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Guardar e publicar' })).toBeEnabled();
});

test('a failed build is reported after saving without claiming publication succeeded', async ({ page }) => {
  const mock = await mockAdmin(page, { failedBuild: true }); await open(page, 'mods/realm-gym');
  await page.getByLabel('Nome do mod', { exact: true }).fill('Realm Gym — saved change');
  await page.getByRole('button', { name: 'Guardar e publicar' }).click();
  await expect(page.locator('#publication-status')).toContainText('houve um erro');
  await expect(page.locator('#publication-status')).not.toContainText('Publicado'); expect(mock.writes).toHaveLength(1);
});

test('the visual formatting toolbar writes formatted Markdown', async ({ page }) => {
  const mock = await mockAdmin(page); await open(page, 'wiki/new');
  await page.getByLabel('Título', { exact: true }).fill('A formatted guide');
  await page.getByLabel('Descrição curta', { exact: true }).fill('A short summary.');
  const rich = page.getByRole('textbox', { name: 'Conteúdo da página' });
  await rich.fill('A helpful tip'); await rich.press('Control+a');
  await page.getByRole('button', { name: 'Negrito', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar rascunho' }).click();
  await expect(page.locator('#editor-notice')).toContainText('Rascunho guardado');
  expect(mock.writes[0].text).toContain('**A helpful tip**');
});

test('new guides use a visual editor, a generated address and a draft-first save', async ({ page }) => {
  const mock = await mockAdmin(page); await open(page, 'wiki/new');
  await page.getByLabel('Título', { exact: true }).fill('My new guide'); await page.getByLabel('Descrição curta', { exact: true }).fill('Guide description');
  await page.getByRole('textbox', { name: 'Conteúdo da página' }).fill('Treino diário com ação e diversão.');
  await page.getByRole('button', { name: 'Guardar rascunho' }).click();
  await expect(page.locator('#editor-notice')).toContainText('Rascunho guardado');
  expect(mock.writes[0].path).toBe('src/content/wiki/my-new-guide.md'); expect(mock.writes[0].body.sha).toBeUndefined();
  const data = parse(mock.writes[0].text.split('---')[1]); expect(data.draft).toBe(true); expect(data.order).toBe(50);
  expect(mock.writes[0].text).toContain('Treino diário com ação');
});

test('visual article edits preserve local image references and Markdown tables', async ({ page }) => {
  const mock = await mockAdmin(page); await open(page, 'wiki/realm-origins');
  expect(await page.locator('[data-rich-editor] img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.getByRole('textbox', { name: 'Conteúdo da página' }).press('Control+End'); await page.keyboard.type(' More helpful information.');
  await page.getByRole('button', { name: 'Guardar e publicar' }).click(); await expect(page.locator('#editor-notice')).toContainText('Alterações guardadas');
  expect(mock.writes[0].text).toContain('../../assets/screenshots/origins-creation.png'); expect(mock.writes[0].text).toContain('../../assets/screenshots/origins-book.png');
  await page.getByRole('navigation', { name: 'Administração' }).getByRole('link', { name: 'Guias da wiki' }).click();
  await page.getByRole('link', { name: /Train at your gym/ }).click();
  await expect(page.locator('[data-rich-editor] table').filter({ hasText: 'Controls' })).toHaveCount(1);
  await expect(page.locator('[data-rich-editor] table').filter({ hasText: 'Edition' })).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Conteúdo da página' }).press('Control+End'); await page.keyboard.type(' Extra gym information.');
  await page.getByRole('button', { name: 'Guardar e publicar' }).click(); await expect(page.locator('#editor-notice')).toContainText('Alterações guardadas');
  expect(mock.writes[1].text).toContain('| Equipment'); expect(mock.writes[1].text).toContain('Bench press');
  expect(mock.writes[1].text).toContain('| Edition'); expect(mock.writes[1].text).toContain('Fabric');
});

test('previews sanitize Markdown HTML instead of executing scripts', async ({ page }) => {
  await mockAdmin(page); await open(page, 'wiki/new');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByRole('textbox', { name: 'Conteúdo da página' }).fill('<img src=x onerror="window.adminXss=true"><script>window.adminXss=true</script><iframe src="https://example.test"></iframe>');
  expect(await page.evaluate(() => (window as any).adminXss)).toBeUndefined();
  await expect(page.locator('#editor-preview-body script, #editor-preview-body iframe, #editor-preview-body [onerror]')).toHaveCount(0);
});

test('homepage sections and modpack access save valid data with unrelated settings preserved', async ({ page }) => {
  const mock = await mockAdmin(page); await open(page, 'home');
  await page.getByLabel('Título principal', { exact: true }).fill('A new homepage title'); await page.getByRole('button', { name: 'Guardar e publicar' }).click(); await expect(page.locator('#editor-notice')).toContainText('Alterações guardadas');
  expect(JSON.parse(mock.writes[0].text).heroTitle).toBe('A new homepage title');
  await page.getByRole('navigation', { name: 'Administração' }).getByRole('link', { name: 'Modpack', exact: true }).click();
  const originalSite = JSON.parse(mock.documents['src/data/site.json']);
  await page.getByLabel('Acesso', { exact: true }).selectOption('public');
  await page.getByRole('button', { name: 'Guardar e publicar' }).click(); expect(mock.writes).toHaveLength(1);
  await page.getByLabel('Endereço do download', { exact: true }).fill('https://example.test/modpack.zip');
  await page.getByRole('button', { name: 'Guardar e publicar' }).click(); await expect(page.locator('#editor-notice')).toContainText('Alterações guardadas');
  const saved = JSON.parse(mock.writes[1].text); expect(saved.modpack.distribution).toBe('public'); expect(saved.categories).toEqual(originalSite.categories); expect(saved.siteName).toBe(originalSite.siteName);
});

test('admin views work on mobile and pass serious accessibility checks', async ({ page }) => {
  await mockAdmin(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['', 'mods', 'mods/realm-gym', 'wiki/realm-gym', 'home', 'modpack']) {
      await open(page, route); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, 'mods');
  await page.getByRole('button', { name: 'Abrir menu' }).click(); await expect(page.getByRole('navigation', { name: 'Administração' })).toBeInViewport(); await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  const axe = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const route of ['', 'mods', 'mods/realm-gym', 'wiki/realm-gym', 'home']) {
    await open(page, route); await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter((violation: any) => ['serious', 'critical'].includes(violation.impact)).map((violation: any) => ({ id: violation.id, nodes: violation.nodes.map((node: any) => node.target) })));
    expect(violations, route).toEqual([]);
  }
});

test('feedback moderation requires the site role and supports hiding and restoring', async ({ page, context }) => {
  const auth = authServer(); await auth.attach(context); await mockAdmin(page);
  let allowed = true, hidden: string | null = null; let moderationReads = 0;
  await page.route('**/rest/v1/rpc/**', async route => {
    const action = new URL(route.request().url()).pathname.split('realm_feedback_')[1], headers = { 'access-control-allow-origin': '*' };
    if (action === 'is_moderator') return route.fulfill({ headers, json: allowed });
    if (action === 'moderation') { moderationReads++; return route.fulfill({ headers, json: { items: [{ id: '00000000-0000-4000-9000-000000000001', author_id: '00000000-0000-4000-8000-000000000002', display_name: 'A player', body: 'Please improve the animations.', resource_type: 'mod', resource_id: 'realm-gym', created_at: '2026-11-14T10:00:00Z', updated_at: '2026-11-14T10:00:00Z', hidden_at: hidden }] } }); }
    if (action === 'set_hidden') { hidden = route.request().postDataJSON().p_hidden ? new Date().toISOString() : null; return route.fulfill({ headers, json: null }); }
    return route.fulfill({ status: 403, headers, json: { code: '42501' } });
  });
  await open(page, 'feedback'); await expect(page.locator('[data-moderation-list]')).toContainText('Please improve the animations.');
  await page.getByRole('button', { name: 'Ocultar comentário', exact: true }).click(); await expect(page.locator('.moderation-meta')).toContainText('Oculto'); expect(hidden).toBeTruthy();
  await page.getByRole('button', { name: 'Restaurar comentário', exact: true }).click(); await expect(page.locator('.moderation-meta')).toContainText('Público'); expect(hidden).toBeNull();
  await page.getByRole('link', { name: 'Mods', exact: true }).click(); allowed = false; await page.getByRole('link', { name: 'Feedback', exact: true }).click();
  await expect(page.locator('[data-moderation-status]')).toContainText('não tem permissões'); expect(moderationReads).toBe(1); await expect(page.locator('.moderation-comment')).toHaveCount(0);
});
