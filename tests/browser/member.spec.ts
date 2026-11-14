import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { authServer, alice, bob } from './fixtures/member-auth';

async function openAccount(page: Page) { await page.goto('/account/'); await expect(page.getByRole('tab', { name: /Your collection/ })).toBeVisible(); }
async function profile(page: Page) { await page.getByRole('tab', { name: 'Profile & setup' }).click(); }
const metadata = (favoriteMods: string[] = [], favoriteGuides: string[] = [], follows = {}) => ({ version: 1, name: '', avatar: 'spark', setup: { minecraft: '', loader: '' }, favoriteMods, favoriteGuides, follows });

test('a profile is saved to the authenticated account and available on another device', async ({ page, browser, context }) => {
  const server = authServer(); await server.attach(context); await openAccount(page); await profile(page);
  await page.getByLabel('Nickname', { exact: true }).fill('Alice Craft');
  await page.getByLabel('Minecraft version', { exact: true }).selectOption('1.20.1'); await page.getByLabel('Mod loader', { exact: true }).selectOption('Forge');
  await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('[data-member-status]')).toContainText('Profile saved');
  expect(server.users[alice].user_metadata.realm_studios.name).toBe('Alice Craft'); expect(server.users[alice].user_metadata.provider_value).toBe('preserve-me'); expect(Object.keys(server.writes[0].body.data)).toEqual(['realm_studios']);
  const second = await browser.newContext(); await server.attach(second); const otherPage = await second.newPage(); await openAccount(otherPage);
  await expect(otherPage.locator('[data-member-name]')).toHaveText('Alice Craft'); await profile(otherPage); await expect(otherPage.getByLabel('Minecraft version', { exact: true })).toHaveValue('1.20.1'); await expect(otherPage.getByRole('radio')).toHaveCount(0); await second.close();
});

test('mods and guides can be saved, found in the collection and removed', async ({ page, context }) => {
  const server = authServer(); await server.attach(context);
  await page.goto('/mods/realm-gym/'); await page.getByRole('button', { name: 'Save Realm Gym', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Realm Gym from saved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/wiki/realm-gym/'); await page.getByRole('button', { name: 'Save Train at your gym', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Train at your gym from saved' })).toHaveAttribute('aria-pressed', 'true');
  await openAccount(page); await expect(page.locator('[data-saved-mods]')).toContainText('Realm Gym'); await expect(page.locator('[data-saved-guides]')).toContainText('Train at your gym');
  await page.locator('[data-saved-mods]').getByRole('button', { name: 'Remove', exact: true }).click(); await expect(page.locator('[data-saved-mods]')).toContainText('Start your own collection');
  await page.locator('[data-saved-guides]').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('[data-saved-guides]')).toContainText('A little knowledge, saved for later');
  expect(server.users[alice].user_metadata.realm_studios.favoriteMods).toEqual([]); expect(server.users[alice].user_metadata.realm_studios.favoriteGuides).toEqual([]);
});

test('following starts read and new releases are acknowledged per loader edition', async ({ page, context }) => {
  const server = authServer(); await server.attach(context); await page.goto('/mods/contracts-bounties/');
  await page.getByRole('button', { name: 'Follow Contracts & Bounties', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow Contracts & Bounties', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const state = server.users[alice].user_metadata.realm_studios;
  expect(Object.keys(state.follows['contracts-bounties'].seen).sort()).toEqual(['forge-1.20.1', 'neoforge-1.21.1']);
  state.follows['contracts-bounties'].seen['forge-1.20.1'] = '0.0.0';
  await openAccount(page); await page.getByRole('tab', { name: /Following/ }).click();
  await expect(page.locator('.member-new-badge')).toHaveText('New release'); await expect(page.locator('.member-editions small')).toHaveCount(1);
  await expect(page.locator('.member-editions > div').filter({ hasText: 'Forge · Minecraft 1.20.1' })).toContainText('New');
  await page.getByRole('button', { name: 'Mark as read' }).click(); await expect(page.locator('.member-new-badge')).toHaveCount(0);
  expect(server.users[alice].user_metadata.realm_studios.follows['contracts-bounties'].seen['forge-1.20.1']).not.toBe('0.0.0');
  await page.getByRole('button', { name: 'Unfollow', exact: true }).click(); await expect(page.locator('[data-followed-mods]')).toContainText('Follow the projects you play');
});

test('an explicit anonymous Save is completed after login and returns to that mod', async ({ page, context }) => {
  const server = authServer(); await server.attach(context, null); await page.goto('/mods/realm-gym/');
  await page.getByRole('button', { name: 'Save Realm Gym', exact: true }).click(); await expect(page).toHaveURL(/\/account\/\?next=/);
  await expect(page.getByLabel('Email address')).toBeEnabled(); await page.getByLabel('Email address').fill('alice@example.test'); await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/mods\/realm-gym\/$/);
  await expect(page.getByRole('button', { name: 'Remove Realm Gym from saved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(server.users[alice].user_metadata.realm_studios.favoriteMods).toEqual(['realm-gym']); expect(server.writes).toHaveLength(1);
});

test('a URL alone cannot create a pending save or redirect to another origin', async ({ page, context }) => {
  const server = authServer(); await server.attach(context); await page.goto('/account/?next=https%3A%2F%2Fevil.test%2F&action=follow&id=realm-gym');
  await expect(page.getByRole('tab', { name: /Your collection/ })).toBeVisible(); expect(server.writes).toHaveLength(0); await expect(page).toHaveURL(/\/account\//);
});

test('independent quick actions and profile changes preserve the latest server data', async ({ page, context }) => {
  const server = authServer(); await server.attach(context); await page.goto('/mods/realm-gym/');
  await expect.poll(async () => await page.locator('.account-link').getAttribute('title')).toBe('Your Realm account');
  server.writeDelay = 200;
  await page.getByRole('button', { name: 'Save Realm Gym', exact: true }).click();
  await page.getByRole('button', { name: 'Follow Realm Gym', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow Realm Gym', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Remove Realm Gym from saved', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(server.users[alice].user_metadata.realm_studios.favoriteMods).toEqual(['realm-gym']);
  await openAccount(page); await profile(page);
  server.users[alice].user_metadata.realm_studios.favoriteGuides = ['installation'];
  await page.getByLabel('Nickname', { exact: true }).fill('A new name'); await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('[data-member-status]')).toContainText('Profile saved');
  expect(server.users[alice].user_metadata.realm_studios.favoriteGuides).toEqual(['installation']); expect(server.users[alice].user_metadata.realm_studios.favoriteMods).toEqual(['realm-gym']);
});

test('failed writes retain the prior saved state and keep profile edits available to retry', async ({ page, context }) => {
  const server = authServer(); await server.attach(context); await page.goto('/mods/realm-gym/'); server.failNext = true;
  await page.getByRole('button', { name: 'Save Realm Gym', exact: true }).click(); await expect(page.locator('#member-toast')).toContainText('could not save');
  await expect(page.getByRole('button', { name: 'Save Realm Gym', exact: true })).toHaveAttribute('aria-pressed', 'false'); expect(server.users[alice].user_metadata.realm_studios).toBeUndefined();
  await openAccount(page); await profile(page); await page.getByLabel('Nickname', { exact: true }).fill('Keep this edit'); server.failNext = true;
  await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('[data-member-status]')).toContainText('could not be saved'); await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue('Keep this edit');
  await page.getByRole('button', { name: 'Save profile' }).click(); await expect(page.locator('[data-member-status]')).toContainText('Profile saved');
});

test('a changed identity cannot apply an in-flight action to another account', async ({ page, context }) => {
  const server = authServer(); await server.attach(context); await page.goto('/mods/realm-gym/');
  await expect.poll(async () => await page.locator('.account-link').getAttribute('title')).toBe('Your Realm account'); server.forceUser = bob;
  await page.getByRole('button', { name: 'Save Realm Gym', exact: true }).click(); await expect(page.locator('#member-toast')).toContainText('session has changed'); expect(server.writes).toHaveLength(0);
});

test('sign-out clears private data before a different user signs in', async ({ page, context }) => {
  const server = authServer(); server.users[alice].user_metadata.realm_studios = { ...metadata(['realm-gym']), name: 'Alice Private' }; server.users[bob].user_metadata.realm_studios = { ...metadata(), name: 'Bob' }; await server.attach(context); await openAccount(page);
  await expect(page.locator('[data-member-name]')).toHaveText('Alice Private'); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('[data-saved-mods]')).toBeEmpty(); await expect(page.locator('[data-session-email]')).toHaveText('');
  await page.getByLabel('Email address').fill('bob@example.test'); await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('[data-member-name]')).toHaveText('Bob'); await expect(page.locator('[data-saved-mods]')).toContainText('Start your own collection'); await expect(page.locator('[data-session-panel]')).not.toContainText('Alice Private');
});

test('setup matching uses one edition and profile strings remain plain text', async ({ page, context }) => {
  const server = authServer(); server.users[alice].user_metadata.realm_studios = { ...metadata(['contracts-bounties']), name: '<svg onload=alert(1)>', avatar: 'invalid', setup: { minecraft: '1.21.1', loader: 'Forge' } }; await server.attach(context); await openAccount(page);
  await expect(page.locator('[data-member-name]')).toHaveText('<svg onload=alert(1)>'); await expect(page.locator('[data-member-name] svg')).toHaveCount(0); await expect(page.locator('[data-saved-mods]')).toContainText('Different version or loader');
  await page.goto('/mods/contracts-bounties/'); await expect(page.locator('[data-member-setup-note]')).toContainText('No edition matches');
  server.users[alice].user_metadata.realm_studios.setup.minecraft = '1.20.1'; await page.reload(); await expect(page.locator('[data-member-setup-note]')).toContainText('Matches your setup');
  await expect(page.locator('[data-member-setup-note] a')).toHaveAttribute('href', /forge-1.20.1.jar$/);
});

test('member dashboards fit mobile screens and support accessible keyboard tabs', async ({ page, context }) => {
  const server = authServer(); server.users[alice].user_metadata.realm_studios = metadata(['realm-gym', 'contracts-bounties', 'realm-origins'], ['installation'], { 'contracts-bounties': { seen: {} } }); await server.attach(context);
  const axe = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const width of [320, 390, 768, 901, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await openAccount(page);
    for (const tab of [/Your collection/, /Following/, 'Profile & setup']) {
      await page.getByRole('tab', { name: tab }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${String(tab)} at ${width}px`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await openAccount(page);
  const first = page.getByRole('tab', { name: /Your collection/ }); await first.focus(); await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: 'Profile & setup' })).toBeFocused();
  for (const tab of [/Your collection/, /Following/, 'Profile & setup']) {
    await page.getByRole('tab', { name: tab }).click(); await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter((violation: any) => ['serious', 'critical'].includes(violation.impact)).map((violation: any) => ({ id: violation.id, nodes: violation.nodes.map((node: any) => node.target) })));
    expect(violations, String(tab)).toEqual([]);
  }
});
