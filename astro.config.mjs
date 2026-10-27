import { defineConfig } from 'astro/config';

// Set SITE_URL to the production address once Cloudflare assigns it.
const site = process.env.SITE_URL || process.env.CF_PAGES_URL;

export default defineConfig({
  output: 'static',
  ...(site ? { site } : {}),
  trailingSlash: 'always',
  vite: { build: { assetsInlineLimit: 0 } },
});
