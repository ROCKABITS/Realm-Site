import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { mods } from '../data/mods';

export const GET: APIRoute = async ({ site }) => {
  const paths = ['/', '/mods/', '/wiki/', '/modpack/', '/modpack/changelog/', '/about/', ...mods.map(mod => `/mods/${mod.slug}/`), ...(await getCollection('wiki')).map(guide => `/wiki/${guide.id}/`), ...(await getCollection('changelog', ({ data }) => !data.draft)).map(release => `/modpack/changelog/${release.id}/`)];
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const urls = site ? paths.map(path => `<url><loc>${escape(new URL(path, site).href)}</loc></url>`).join('') : '';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
};
