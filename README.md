# Realm Studios

The home of **ROCKadm's Minecraft mods**, player guides and the **Season 8** modpack journal. Built with Astro and TypeScript for https://realmstudios.pt.

## Develop and validate

Use Node 24 and npm:

```sh
npm ci
npm run check
npm run test:content
npm run build
npm test
npm run test:browser
npm run preview
```

`ASTRO_TELEMETRY_DISABLED=1` supports environments with a read-only home directory. To use a system Chromium in tests, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

The production build in `dist/` includes Pagefind search. Search is available in build/preview; catalogue and wiki filters also work in development. Browser tests cover search, filters, keyboard navigation, narrow layouts, first-screen downloads, galleries and accessibility.

## Publish

Cloudflare Pages uses **realm-studios-site** as the production branch, `npm run build` as the build command and `dist` as output. Node 24 and development dependencies are required for the build. Pushing this branch publishes through the existing Git integration.

The canonical production URL defaults to `https://realmstudios.pt`. `SITE_URL` can specify another custom origin; transient `pages.dev` origins are ignored. Cloudflare preview branches receive noindex metadata and a disallowing robots file.

Every successful Validate website workflow uploads a **realm-studios-pages** artifact with `index.html` at its root. This is also usable for a manual Pages upload. The ZIP previously committed under `downloads/` is an archived build; use a current workflow artifact or rebuild the source for current content.

## Content and administration

Use **Account → Open the admin panel** to edit content without typing an admin URL. Saves commit to **realm-studios-site** and trigger the existing Pages integration. See [ADMIN-SETUP.md](ADMIN-SETUP.md) for administrator authentication and [ACCOUNT-SETUP.md](ACCOUNT-SETUP.md) for visitor accounts and the required live Supabase configuration.

- `src/data/home.json` supplies all homepage copy fields exposed by the CMS.
- `src/data/site.json` supplies the brand, creator, external links and modpack settings.
- `src/data/mods.json` holds editorial mod descriptions, categories, featured flags and gallery keys.
- `src/content/wiki/` contains guides. `category` is required; `draft: true` hides a guide from routes, navigation and sitemap.
- `src/content/changelog/` contains modpack releases. Published entries provide the latest-release label. Drafts are hidden.

Season 8 defaults to group distribution. Set `distribution` to `public` **and provide its real download URL** to enable a public download. The build rejects public distribution without a URL.

Artwork and gallery keys are validated at build time. Add imported artwork in `src/data/artwork.ts` and screenshot/video entries in `src/data/media.ts` before selecting them in the CMS.

## Release catalogue

Version numbers, download files and compatibility are generated separately from editorial content:

```sh
npm run sync:releases
npm run build
npm test
```

`scripts/sync-releases.mjs` reads the public **ROCKABITS/Mods** release tree, selects the newest semantic version for each configured edition, reads its build metadata and writes `src/data/releases.json`. Downloads are pinned to a repository commit. Existing editorial descriptions are preserved. Forge and NeoForge releases are selected independently.

`src/data/catalog-sources.json` maps each catalogue slug to its source folder and edition filenames. Add a source mapping, editorial entry, artwork and player guide when adding a new project.

The **Refresh mod releases** workflow runs daily and can be started manually. It checks out the website branch, refreshes metadata, runs validation and browser tests, then commits only a validated manifest. Its workflow file is also installed on the default `main` branch because GitHub schedules require that. Cloudflare publishes the resulting website-branch commit through the existing integration.

## Styles

`src/styles/global.css` imports shared tokens, base rules, prose styles and component files for navigation, homepage, catalogue, wiki, modpack and search. Primary action colours are separate from gold details. Responsive rules live beside their components; the previous stacked redesign overrides have been removed.

## Preview images

[Homepage](docs/previews/home-desktop.png) · [Mobile](docs/previews/home-mobile.png)
