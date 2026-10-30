import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('mod category and text filters work together and reset', async ({ page }) => {
  await page.goto('/mods/');
  await expect(page.locator('.mod-card:visible')).toHaveCount(13);
  await page.getByRole('button', { name: 'Economy & trade', exact: true }).click();
  await expect(page.locator('.mod-card:visible')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search mods' }).fill('market');
  await expect(page.locator('.mod-card:visible')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search mods' }).fill('no-such-mod');
  await expect(page.locator('#no-mods')).toBeVisible();
  await page.getByRole('button', { name: 'Show all mods' }).click();
  await expect(page.locator('.mod-card:visible')).toHaveCount(13);
});

test('full-text search finds guide content and supports keyboard dismissal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('searchbox').fill('instalments');
  await expect(page.locator('.search-result')).not.toHaveCount(0);
  await expect(page.locator('#search-results')).toContainText('Treasury');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('wiki filtering hides empty categories and restores all guides', async ({ page }) => {
  await page.goto('/wiki/');
  await expect(page.locator('.wiki-guide-card:visible')).toHaveCount(14);
  await page.getByRole('searchbox', { name: 'Filter player guides' }).fill('wedding');
  await expect(page.locator('.wiki-guide-card:visible')).toHaveCount(1);
  await expect(page.locator('.wiki-group:visible')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Filter player guides' }).fill('');
  await expect(page.locator('.wiki-guide-card:visible')).toHaveCount(14);
});

test('mobile navigation, overflow, and images work across key pages', async ({ page }) => {
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/', '/mods/', '/mods/realm-origins/', '/wiki/', '/wiki/realm-marriage/', '/modpack/', '/modpack/changelog/']) {
      await page.goto(route);
      await page.evaluate(async () => { await document.fonts.ready; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
      expect(await page.locator('img').evaluateAll(images => images.map(image => image as HTMLImageElement).filter(image => image.loading !== 'lazy').every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).not.toBeVisible();
  await expect(menu).toBeFocused();
});

test('published changelog has an honest empty state and no draft', async ({ page }) => {
  await page.goto('/modpack/changelog/');
  await expect(page.getByRole('heading', { name: 'No release notes yet.' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('YOUR-VERSION');
  await expect(page.locator('body')).not.toContainText('Draft template');
});

test('key pages pass serious and critical accessibility checks', async ({ page }) => {
  const axe = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
  for (const route of ['/', '/mods/', '/wiki/', '/wiki/realm-origins/', '/modpack/', '/modpack/changelog/']) {
    await page.goto(route);
    await page.addScriptTag({ content: axe });
    const violations = await page.evaluate(async () => {
      const result = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return result.violations.filter((violation: any) => ['serious', 'critical'].includes(violation.impact)).map((violation: any) => ({ id: violation.id, description: violation.description, nodes: violation.nodes.map((node: any) => ({ target: node.target, summary: node.failureSummary })) }));
    });
    expect(violations, route).toEqual([]);
  }
});
