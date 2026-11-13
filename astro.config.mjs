import { defineConfig } from 'astro/config';
const configured = process.env.SITE_URL;
const site = configured && !new URL(configured).hostname.endsWith('.pages.dev') ? configured : 'https://realmstudios.pt';
if (!/^https?:\/\//.test(site)) throw new Error('SITE_URL must be an absolute HTTP(S) address.');
export default defineConfig({ output: 'static', site, trailingSlash: 'always', vite: { build: { assetsInlineLimit: 0 } } });
