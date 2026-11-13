import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'visitor@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString() };
const jwt = () => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'fixture-signature'].join('.');
type Call = { method: string; path: string; body: any; url: string };

async function mockAuth(page: Page, options: { invalidPassword?: boolean; unavailable?: boolean; signupDisabled?: boolean } = {}) {
  const calls: Call[] = [];
  // No real emails or accounts are created by these tests.
  await page.route('**/auth/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace('/auth/v1/', '');
    calls.push({ method: request.method(), path, body: request.postDataJSON(), url: request.url() });
    const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Supabase-Api-Version', 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' };
    if (options.unavailable) return route.fulfill({ status: 503, headers, body: JSON.stringify({ message: 'Unavailable' }) });
    if (path === 'settings') return route.fulfill({ headers, json: { external: { email: true }, disable_signup: !!options.signupDisabled, mailer_autoconfirm: false } });
    if (path === 'token') return route.fulfill({ status: options.invalidPassword ? 400 : 200, headers, json: options.invalidPassword ? { code: 'invalid_credentials', msg: 'Invalid login credentials' } : { access_token: jwt(), refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user } });
    if (path === 'signup' || path === 'user') return route.fulfill({ headers, json: user });
    if (path === 'logout') return route.fulfill({ status: 204, headers });
    if (path === 'recover') return route.fulfill({ headers, json: {} });
    return route.fulfill({ status: 400, headers, json: { message: 'Unexpected endpoint' } });
  });
  return calls;
}

test('header and mobile menu lead to accounts; administration remains accessible when visitor auth is down', async ({ page }) => {
  await mockAuth(page, { unavailable: true });
  await page.goto('/'); await page.getByRole('link', { name: 'Your account', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/$/);
  await expect(page.getByRole('status')).toContainText('currently unavailable');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Open the admin panel' })).toHaveAttribute('href', '/admin/');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Account & sign in' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Open the admin panel' }).click();
  await expect(page).toHaveURL(/\/admin\/$/);
});

test('invalid credentials show a useful error and permit another attempt', async ({ page }) => {
  const calls = await mockAuth(page, { invalidPassword: true });
  await page.goto('/account/');
  await expect(page.locator('[name=email]')).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('did not work');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  expect(calls.filter(call => call.path === 'token')).toHaveLength(1);
});

test('visitor sign-in persists across reload and sign-out clears the session', async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto('/account/'); await expect(page.locator('[name=email]')).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('my-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Realm account.' })).toBeVisible();
  await expect(page.locator('[data-session-email]')).toHaveText(user.email);
  expect(calls.some(call => call.path === 'user' && call.method === 'GET')).toBe(true);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Your Realm account.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('signed out');
  expect(await page.evaluate(() => localStorage.getItem('realm-studios-auth'))).toBeNull();
  await page.reload(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.locator('[data-session-email]')).toBeHidden();
});

test('registration requires a strong password and provides email confirmation instructions', async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto('/account/?mode=signup'); await expect(page.locator('[name=email]')).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect(calls.some(call => call.path === 'signup')).toBe(false);
  await page.getByLabel('Password', { exact: true }).fill('my-new-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your inbox');
  const signup = calls.find(call => call.path === 'signup')!;
  expect(new URL(signup.url).searchParams.get('redirect_to')).toBe('http://127.0.0.1:4321/account/');
  await expect(page.locator('[data-session-panel]')).toBeHidden();
});

test('recovery request does not reveal whether an account exists', async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto('/account/'); await expect(page.locator('[name=email]')).toBeEnabled();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page).toHaveURL(/mode=reset/);
  await page.getByLabel('Email address').fill(user.email);
  await expect(page.getByLabel('Password', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Send recovery email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  expect(new URL(calls.find(call => call.path === 'recover')!.url).searchParams.get('redirect_to')).toBe('http://127.0.0.1:4321/account/reset/');
  await page.goBack(); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('password reset rejects missing and expired links and validates matching passwords', async ({ page }) => {
  const calls = await mockAuth(page);
  await page.goto('/account/reset/'); await expect(page.getByRole('status')).toContainText('missing, expired');
  await expect(page.locator('[data-reset-form]')).toBeHidden();
  await page.goto('/account/reset/#error=access_denied&error_code=otp_expired&error_description=expired');
  await expect(page.getByRole('status')).toContainText('missing, expired'); await expect(page).toHaveURL(/\/account\/reset\/$/);
  await page.goto(`/account/reset/#access_token=${jwt()}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=recovery`);
  await expect(page.getByLabel('New password', { exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/account\/reset\/$/);
  await page.getByLabel('New password', { exact: true }).fill('my-new-test-password');
  await page.getByLabel('Confirm new password').fill('my-other-test-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status')).toContainText('do not match');
  await page.getByLabel('Confirm new password').fill('my-new-test-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status')).toContainText('password has been updated');
  expect(calls.filter(call => call.path === 'user' && call.method === 'PUT')).toHaveLength(1);
});

test('registration availability follows server settings', async ({ page }) => {
  const calls = await mockAuth(page, { signupDisabled: true });
  await page.goto('/account/?mode=signup'); await expect(page.locator('[name=email]')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create account', exact: true })).toBeDisabled();
  expect(calls.some(call => call.path === 'signup')).toBe(false);
});

test('account forms are accessible and fit narrow screens', async ({ page }) => {
  await mockAuth(page);
  const axe = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/account/', '/account/?mode=signup', '/account/?mode=reset', '/account/reset/']) {
      await page.goto(route); await expect(page.locator('[data-account-status]')).not.toContainText('Checking');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
    }
  }
  await page.goto('/account/?mode=signup'); await expect(page.locator('[name=email]')).toBeEnabled();
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () => (await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter((v: any) => ['serious', 'critical'].includes(v.impact)));
  expect(violations).toEqual([]);
});
