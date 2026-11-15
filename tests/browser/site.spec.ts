import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
const mods = JSON.parse(readFileSync(new URL('../../src/data/mods.json', import.meta.url),'utf8')).mods;
const guideCount = readdirSync(new URL('../../src/content/wiki/', import.meta.url)).filter(x => x.endsWith('.md')).length;

test('mod category and text filters work together and reset', async ({ page }) => {
  await page.goto('/mods/');
  await expect(page.locator('.mod-card:visible')).toHaveCount(mods.length);
  await page.getByRole('button', { name: 'Economy & trade', exact: true }).click();
  await expect(page.locator('.mod-card:visible')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search mods' }).fill('market');
  await expect(page.locator('.mod-card:visible')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search mods' }).fill('no-such-mod');
  await expect(page.locator('#no-mods')).toBeVisible();
  await page.getByRole('button', { name: 'Show all mods' }).click();
  await expect(page.locator('.mod-card:visible')).toHaveCount(mods.length);
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
  await expect(page.locator('.wiki-guide-card:visible')).toHaveCount(guideCount);
  await page.getByRole('searchbox', { name: 'Filter player guides' }).fill('wedding');
  await expect(page.locator('.wiki-guide-card:visible')).toHaveCount(1);
  await expect(page.locator('.wiki-group:visible')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Filter player guides' }).fill('');
  await expect(page.locator('.wiki-guide-card:visible')).toHaveCount(guideCount);
});

test('mobile navigation, overflow, and images work across key pages', async ({ page }) => {
  for (const width of [320, 360, 390, 768]) {
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

test('changelog matches the published release content and hides drafts', async ({ page }) => {
  await page.goto('/modpack/changelog/');
  const published = readdirSync(new URL('../../src/content/changelog/',import.meta.url)).filter(x=>x.endsWith('.md')).some(name=>!/draft:\s*true/.test(readFileSync(new URL('../../src/content/changelog/'+name, import.meta.url),'utf8')));
  if (published) { await expect(page.locator('.release-card').first()).toBeVisible();await expect(page.getByRole('heading',{name:'No release notes yet.'})).not.toBeVisible(); }
  else await expect(page.getByRole('heading',{name:'No release notes yet.'})).toBeVisible();
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


test('mobile downloads are visible before scrolling and loader editions are distinct', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ['realm-origins','realm-gym','contracts-bounties']) {
    await page.goto(`/mods/${slug}/`);await page.evaluate(async()=>{await document.fonts.ready;});
    const button=page.getByRole('link',{name:'Download JAR',exact:true});const box=await button.boundingBox();
    expect(box).not.toBeNull();expect(box!.y+box!.height).toBeLessThan(844);
  }
  await expect(page.getByRole('link',{name:'Download Contracts & Bounties for Forge 1.20.1',exact:true})).toHaveAttribute('href',/forge-1.20.1.jar$/);
});

test('Realm Gym has gameplay images and a video without autoplay', async ({ page }) => {
  await page.goto('/mods/realm-gym/');await expect(page.locator('.gameplay-grid img')).toHaveCount(2);
  await expect(page.locator('video')).toHaveAttribute('preload','none');await expect(page.locator('video')).not.toHaveAttribute('autoplay','');
});

test('Season 8 explains availability and links to access instructions', async ({ page }) => {
  await page.goto('/modpack/');await expect(page.locator('.version-label')).not.toBeEmpty();
  await expect(page.locator('#modpack-access')).toBeVisible();await expect(page.locator('.distribution-label')).not.toBeEmpty();
});

test('Realm Gym exposes four editions across three loaders and scopes Fabric API to Fabric', async ({ page }) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/mods/realm-gym/');
    await expect(page.locator('.download-card')).toHaveCount(4);
    const fabric = page.locator('.download-card').filter({ hasText: 'Fabric · Minecraft 1.21.1' });
    await expect(fabric).toContainText('Fabric 0.16.14+');
    await expect(fabric.getByRole('link', { name: 'Fabric API 0.116.18+1.21.1', exact: true })).toHaveAttribute('href', 'https://www.curseforge.com/minecraft/mc-mods/fabric-api');
    await expect(fabric.getByRole('link', { name: 'Download Realm Gym for Fabric 1.21.1', exact: true })).toHaveAttribute('href', /realm-gym-0\.6\.0-fabric-1\.21\.1\.jar$/);
    const forge211 = page.locator('.download-card').filter({ has: page.getByRole('heading', { name: 'Forge · Minecraft 1.21.1', exact: true }) });
    await expect(forge211).toContainText('Forge 52.1.20+'); await expect(forge211).toContainText('Java 21'); await expect(forge211).not.toContainText('Fabric API');
    await expect(forge211.getByRole('link', { name: 'Download Realm Gym for Forge 1.21.1', exact: true })).toHaveAttribute('href', /realm-gym-0\.6\.0-forge-1\.21\.1\.jar$/);
    const forge = page.locator('.download-card').filter({ hasText: 'Forge · Minecraft 1.20.1' });
    await expect(forge).toContainText('Java 17'); await expect(forge).toContainText('Includes six machines');
    await expect(page.locator('.download-card').filter({ hasText: 'NeoForge · Minecraft 1.21.1' })).not.toContainText('Fabric API');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/wiki/realm-gym/'); await expect(page.locator('main')).toContainText('Cable rope triceps'); await expect(page.locator('main')).toContainText('240 kg');
});
