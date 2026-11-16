import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) => {
  const preview = process.env.CF_PAGES === '1' && !!process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== 'realm-studios-site';
  return new Response(`User-agent: *\n${preview ? 'Disallow: /' : 'Allow: /\nDisallow: /admin/'}\n${site && !preview ? `\nSitemap: ${new URL('/sitemap.xml', site).href}\n` : ''}`, { headers: { 'Content-Type': 'text/plain' } });
};
