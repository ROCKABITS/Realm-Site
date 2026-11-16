import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { authServer, alice, bob } from './fixtures/member-auth';

type Item = { id: string; body: string; author_id: string; display_name: string; avatar_path: string | null; created_at: string; updated_at: string; hidden_at: string | null; resource_type: string; resource_id: string };
function feedbackServer(auth: ReturnType<typeof authServer>) {
  const server = {
    items: [] as Item[], likes: new Map<string, Set<string>>(), writes: [] as string[], failNext: '', moderator: false,
    async attach(context: BrowserContext) {
      await context.route('**/rest/v1/rpc/**', async route => {
        const request = route.request(), action = new URL(request.url()).pathname.split('realm_feedback_')[1];
        const args = request.postDataJSON() || {}; let id = '';
        try { id = JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url').toString()).sub; } catch { /* Anonymous request. */ }
        const headers = { 'access-control-allow-origin': '*' };
        const ok = (json: unknown) => route.fulfill({ headers, json });
        const fail = (code: string, message: string) => route.fulfill({ headers, status: 400, json: { code, message } });
        if (server.failNext === action) { server.failNext = ''; return fail('P0001', action === 'comment_create' ? 'COMMENT_RATE_LIMIT' : 'Simulated failure'); }
        const key = `${args.p_type}/${args.p_id}`; const likes = server.likes.get(key) || new Set<string>(); server.likes.set(key, likes);
        const matching = server.items.filter(item => item.resource_type === args.p_type && item.resource_id === args.p_id && !item.hidden_at);
        const summary = () => ({ likes: likes.size, comments: matching.length, liked: likes.has(id), moderator: server.moderator && id === alice });
        if (action === 'summary') return ok(summary());
        if (action === 'is_moderator') return ok(server.moderator && id === alice);
        if (action === 'page' || action === 'moderation') {
          if (action === 'moderation' && !(server.moderator && id === alice)) return fail('42501', 'Moderator required');
          let items = action === 'page' ? matching : server.items;
          items = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          if (args.p_before_time) items = items.filter(item => item.created_at < args.p_before_time || item.created_at === args.p_before_time && item.id < args.p_before_id);
          return ok({ items: items.slice(0, 21).map(item => ({ ...item, can_edit: item.author_id === id, can_delete: item.author_id === id || server.moderator && id === alice, moderator: server.moderator && item.author_id === alice })) });
        }
        if (!id) return fail('42501', 'Sign in required'); server.writes.push(action);
        if (action === 'sync_profile') return ok(null);
        if (action === 'like') { if (args.p_active) likes.add(id); else likes.delete(id); return ok(summary()); }
        if (action === 'comment_create') {
          const now = new Date().toISOString(); server.items.push({ id: crypto.randomUUID(), body: args.p_body.trim(), author_id: id, display_name: auth.users[id].user_metadata.realm_studios?.name || 'Adventurer', avatar_path: auth.users[id].user_metadata.realm_studios?.photoPath || null, created_at: now, updated_at: now, hidden_at: null, resource_type: args.p_type, resource_id: args.p_id }); return ok(server.items.at(-1)!.id);
        }
        const item = server.items.find(item => item.id === args.p_comment); if (!item) return fail('42501', 'Unknown comment');
        if (action === 'comment_edit' && item.author_id === id) { item.body = args.p_body; item.updated_at = new Date().toISOString(); return ok(null); }
        if (action === 'comment_delete' && (item.author_id === id || server.moderator && id === alice)) { server.items.splice(server.items.indexOf(item), 1); return ok(null); }
        if (action === 'set_hidden' && server.moderator && id === alice) { item.hidden_at = args.p_hidden ? new Date().toISOString() : null; return ok(null); }
        return fail('42501', 'Not allowed');
      });
    },
    seed(body: string, author = bob, resource = 'realm-gym', type = 'mod', index = 1) {
      server.items.push({ id: `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`, body, author_id: author, display_name: author === alice ? 'Alice' : 'Bob', avatar_path: null, created_at: new Date(Date.UTC(2026, 10, 1, 0, 0, index)).toISOString(), updated_at: new Date(Date.UTC(2026, 10, 1, 0, 0, index)).toISOString(), hidden_at: null, resource_id: resource, resource_type: type });
    },
  };
  return server;
}
async function openFeedback(page: Page, path = '/mods/realm-gym/') { await page.goto(path); await expect(page.locator('[data-like-count]')).not.toHaveText('—'); }

test('public visitors see shared comments and sign in before writing', async ({ page, context }) => {
  const auth = authServer(); await auth.attach(context, null); const api = feedbackServer(auth); api.seed('<img src=x onerror=alert(1)>'); await api.attach(context);
  await openFeedback(page); await expect(page.locator('[data-comment-count]')).toHaveText('1'); await expect(page.locator('.feedback-comment-body')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.feedback-comment-body img')).toHaveCount(0); await expect(page.locator('[data-feedback-compose]')).toBeHidden(); await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Like Realm Gym', exact: true }).click(); await expect(page).toHaveURL(/\/account\/\?next=/); expect(api.writes).toEqual([]);
});

test('likes are shared across accounts and can be removed without changing saved mods', async ({ page, context, browser }) => {
  const auth = authServer(); await auth.attach(context); const api = feedbackServer(auth); await api.attach(context);
  await openFeedback(page); await page.getByRole('button', { name: 'Like Realm Gym', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlike Realm Gym', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('[data-like-count]')).toHaveText('1'); expect(auth.writes).toHaveLength(0);
  const other = await browser.newContext(); await auth.attach(other, bob); await api.attach(other); const second = await other.newPage(); await openFeedback(second);
  await expect(second.locator('[data-like-count]')).toHaveText('1'); await expect(second.getByRole('button', { name: 'Like Realm Gym', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await second.getByRole('button', { name: 'Like Realm Gym', exact: true }).click(); await expect(second.locator('[data-like-count]')).toHaveText('2');
  await page.getByRole('button', { name: 'Unlike Realm Gym', exact: true }).click(); await expect(page.locator('[data-like-count]')).toHaveText('1'); await other.close();
});

test('posting, editing and deleting work while failed submissions retain the draft', async ({ page, context }) => {
  const auth = authServer(); auth.users[alice].user_metadata.realm_studios = { name: 'Alice Craft' }; await auth.attach(context); const api = feedbackServer(auth); api.seed('Another player’s suggestion'); await api.attach(context);
  await openFeedback(page); await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  const textarea = page.getByLabel('Leave a comment'); await textarea.fill('More weight options please!'); api.failNext = 'comment_create';
  await page.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(page.locator('[data-feedback-status]')).toContainText('30 seconds'); await expect(textarea).toHaveValue('More weight options please!');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(page.locator('.feedback-comment')).toHaveCount(2); await expect(textarea).toHaveValue('');
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Edit your comment').fill('More exercise animations please!'); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.feedback-comment-body').first()).toHaveText('More exercise animations please!');
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Keep comment', exact: true }).click(); await expect(page.locator('.feedback-comment')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete comment', exact: true }).click(); await expect(page.locator('.feedback-comment')).toHaveCount(1); await expect(page.locator('[data-comment-count]')).toHaveText('1');
});

test('older comments paginate without duplicates and guide feedback is separate', async ({ page, context }) => {
  const auth = authServer(); await auth.attach(context); const api = feedbackServer(auth); for (let i = 1; i <= 23; i++) api.seed(`Feedback ${i}`, bob, 'realm-gym', 'mod', i); api.seed('A helpful guide', bob, 'realm-gym', 'guide', 100); await api.attach(context);
  await openFeedback(page); await expect(page.locator('.feedback-comment')).toHaveCount(20); await page.getByRole('button', { name: 'Load older comments' }).click(); await expect(page.locator('.feedback-comment')).toHaveCount(23); await expect(page.getByRole('button', { name: 'Load older comments' })).toBeHidden();
  await openFeedback(page, '/wiki/realm-gym/'); await expect(page.locator('.feedback-comment')).toHaveCount(1); await expect(page.locator('.feedback-comment-body')).toHaveText('A helpful guide');
});

test('failed likes keep the server state and a moderator can hide a comment', async ({ page, context }) => {
  const auth = authServer(); await auth.attach(context); const api = feedbackServer(auth); api.moderator = true; api.seed('Needs moderation'); await api.attach(context); await openFeedback(page);
  api.failNext = 'like'; await page.getByRole('button', { name: 'Like Realm Gym', exact: true }).click(); await expect(page.locator('[data-feedback-status]')).toContainText('could not complete'); await expect(page.locator('[data-like-count]')).toHaveText('0'); await expect(page.getByRole('button', { name: 'Like Realm Gym', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Hide', exact: true }).click(); await expect(page.locator('.feedback-comment')).toHaveCount(0); expect(api.items[0].hidden_at).toBeTruthy();
});

test('feedback fits narrow screens and has accessible controls in dark and light pages', async ({ page, context }) => {
  const auth = authServer(); await auth.attach(context); const api = feedbackServer(auth); api.seed('A'.repeat(2000)); api.seed('Guide feedback', bob, 'realm-gym', 'guide', 2); await api.attach(context);
  for (const path of ['/mods/realm-gym/', '/wiki/realm-gym/']) {
    await openFeedback(page, path);
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${width}`).toBe(true); }
    await page.addScriptTag({ content: readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
    const violations = await page.evaluate(async () => (await (window as any).axe.run('[data-feedback]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter((v: any) => ['serious', 'critical'].includes(v.impact)).map((v: any) => v.id)); expect(violations).toEqual([]);
  }
});

test('profile photos are resized, saved across devices, replaced and removed', async ({ page, context, browser }) => {
  const auth = authServer(); await auth.attach(context); const api = feedbackServer(auth); await api.attach(context);
  const uploaded: string[] = [], deleted: string[] = []; let failUpload = false;
  const attachStorage = async (target: BrowserContext) => target.route('**/storage/v1/**', route => {
    const request = route.request(), url = new URL(request.url()), headers = { 'access-control-allow-origin': '*' };
    if (url.pathname.includes('/object/sign/')) {
      if (request.method() === 'POST') return route.fulfill({ headers, json: { signedURL: url.pathname.replace('/storage/v1', '') + '?token=fixture' } });
      return route.fulfill({ headers, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x0AAAAASUVORK5CYII=', 'base64') });
    }
    if (request.method() === 'DELETE') { deleted.push(...request.postDataJSON().prefixes); return route.fulfill({ headers, json: [] }); }
    if (request.method() === 'POST') {
      if (failUpload) { failUpload = false; return route.fulfill({ status: 503, headers, json: { message: 'Upload unavailable' } }); }
      const buffer = request.postDataBuffer()!; expect(buffer.includes(Buffer.from('WEBP'))).toBe(true); expect(buffer.length).toBeLessThan(524288);
      const path = url.pathname.split('/realm-profile-photos/')[1]; uploaded.push(path); expect(path).toMatch(new RegExp(`^${alice}/[a-f0-9-]{36}\\.webp$`)); return route.fulfill({ headers, json: { Key: `realm-profile-photos/${path}`, Id: crypto.randomUUID() } });
    }
    return route.fulfill({ status: 404, headers, json: {} });
  });
  await attachStorage(context); await page.goto('/account/'); await page.getByRole('tab', { name: 'Profile & setup' }).click();
  await page.getByLabel('Profile photo', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }); await expect(page.locator('[data-photo-status]')).toContainText('JPEG, PNG or WebP'); expect(uploaded).toEqual([]);
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500; canvas.getContext('2d')!.fillRect(0, 0, 800, 500); return canvas.toDataURL('image/png').split(',')[1]; });
  const select = () => page.getByLabel('Profile photo', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await select(); await expect(page.getByAltText('New profile photo preview')).toBeVisible(); expect(uploaded).toHaveLength(0);
  failUpload = true; await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('[data-member-status]')).toContainText('could not be uploaded'); expect(auth.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('[data-member-status]')).toContainText('Profile saved'); expect(uploaded).toHaveLength(1); const first = uploaded[0]; expect(auth.users[alice].user_metadata.realm_studios.photoPath).toBe(first);
  const other = await browser.newContext(); await auth.attach(other); await api.attach(other); await attachStorage(other); const second = await other.newPage(); await second.goto('/account/'); await expect(second.locator('[data-member-avatar] img')).toBeVisible(); await other.close();
  await select(); await expect(page.locator('[data-photo-status]')).toContainText('Photo ready'); await page.getByRole('button', { name: 'Save profile' }).click(); await expect.poll(() => deleted).toContain(first); const replacement = uploaded[1]; expect(auth.users[alice].user_metadata.realm_studios.photoPath).toBe(replacement);
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click(); await page.getByRole('button', { name: 'Save profile' }).click(); await expect.poll(() => deleted).toContain(replacement); expect(auth.users[alice].user_metadata.realm_studios.photoPath).toBe(''); await expect(page.locator('[data-member-avatar] img')).toHaveCount(0);
});

test('a changed account cannot submit another user’s prepared feedback', async ({ page, context }) => {
  const auth = authServer(); await auth.attach(context); const api = feedbackServer(auth); await api.attach(context); await openFeedback(page);
  await page.getByLabel('Leave a comment').fill('A draft for Alice'); auth.forceUser = bob;
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByLabel('Leave a comment')).toHaveValue(''); expect(api.writes).toHaveLength(0); expect(api.items).toHaveLength(0);
});
