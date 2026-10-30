# Realm Studios

The English-language home of **ROCKadm's Minecraft mods**, with a searchable player wiki and a separate **Season 8 modpack** journal. Built with Astro and TypeScript, using the 13 original project images and locally hosted fonts. The output is a static site for **Cloudflare Pages**.

## Download this prepared version

The `realm-studios-site` branch includes a [ready-to-upload Pages ZIP](downloads/realm-studios-pages.zip) and screenshots of the [home page](docs/previews/home-desktop.png), [mobile home page](docs/previews/home-mobile.png), and [Season 8 page](docs/previews/modpack-desktop.png). On GitHub, open the ZIP and use **Download raw file** to save it.

The ZIP is a snapshot of this prepared build. Future source changes need a new build and upload, or a Git-integrated Cloudflare Pages project. For automatic updates, connect this branch as the production branch. The original `main` branch is preserved.

## Local development

Use **Node 24** and npm:

```sh
npm ci
npm run dev
```

The cloud workspace may require `ASTRO_TELEMETRY_DISABLED=1` before Astro commands because the home configuration directory is read-only. The npm cache is kept in the ignored project-local `.npm-cache/` directory.

```sh
ASTRO_TELEMETRY_DISABLED=1 npm run check
ASTRO_TELEMETRY_DISABLED=1 npm run build
ASTRO_TELEMETRY_DISABLED=1 npm run preview
```

`npm run build` generates the site in `dist/` and indexes its English content with Pagefind. Full-text search runs against the production build. In development, the catalogue and wiki filters still work; build and preview to test full-text search.

## Publish free on Cloudflare Pages

Cloudflare account ownership and deployment access stay with you. No paid hosting or custom domain is required. A project name's availability is checked by Cloudflare when the project is created; this repository does not reserve a `pages.dev` address.

### Option A — connect GitHub for automatic updates

1. Review and commit the website files, then push them to the repository branch you want to publish.
2. In the Cloudflare dashboard, open **Workers & Pages**, create a **Pages** project, and connect the GitHub repository.
3. Select the branch containing the website as the production branch.
4. Set these build options:

| Setting | Value |
| --- | --- |
| Framework preset | Astro (or no preset with the values below) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Repository root |
| Environment variable | `NODE_VERSION=24` |

5. Deploy. After Cloudflare assigns the production address, set **`SITE_URL`** to that actual HTTPS address in the production build environment, and trigger a new deployment. This gives canonical links, Open Graph images, robots.txt, and the sitemap the correct production hostname. Prefer the stable production address over a deployment-specific preview URL.

Later pushes to the selected production branch rebuild the site automatically. Keep development dependencies installed during the build: Pagefind is a build-time dependency.

### Option B — direct upload

Build the project and upload the **contents of `dist/`** or a ZIP with `index.html` at its root to a Pages **Direct Upload** project. Do not upload `src/` or `node_modules/`.

After the first upload assigns an address, rebuild with the correct origin and upload the output again:

```sh
SITE_URL=https://YOUR-ACTUAL-PROJECT.pages.dev npm run build
```

Direct Upload projects need another upload for each update. A Git-integrated project is the recommended option for automatic publishing; Cloudflare documents the project-type migration limits in its [Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/).

The optional `wrangler.jsonc` declares the Pages build directory for CLI deployments. If using Wrangler, install it in a trusted local environment, authenticate with your own Cloudflare account, use the actual project name, and run `wrangler pages deploy dist --project-name YOUR-PROJECT`. No credentials belong in source files or chat.

## Add a Season 8 changelog

Copy `src/content/changelog/first-release.md` to a new file, for example `src/content/changelog/1-2-0.md`. The existing file is an **unpublished template**, not an actual release.

Replace the metadata with the real release information:

```yaml
---
title: "A short title for your release"
version: "1.2.0"
date: 2026-11-01
summary: "A factual one-sentence description of this update."
draft: false
---
```

The date and version above are examples. Use the actual date and version of your modpack. Write the changes below with headings such as `## Added`, `## Changed`, `## Fixed`, `## Removed`, and `## Update notes`. Remove sections that do not apply.

Publishing a Markdown entry automatically updates:

- `/modpack/`: the three most recent releases.
- `/modpack/changelog/`: all releases, newest first.
- `/modpack/changelog/1-2-0/`: the full entry, named after the file.
- Site search and the sitemap, when the production origin is configured.

Keep `draft: true` while writing. Drafts are excluded from pages, search, and the sitemap. Change it to `false`, commit, and push when ready. No release notes or modpack versions are fabricated by the site.

## Edit the modpack listing

Set the real `version` and `downloadUrl` in **`src/data/site.ts`**. Until supplied, the site shows the journal and wiki without an unverified download button or version. The Season 8 *presentation mod's* version is not assumed to be the modpack version.

## Maintain the mods and wiki

- **Mod names, versions, dependencies and downloads:** `src/data/mods.ts`.
- **Artwork mapping:** `src/data/artwork.ts`; the uploaded originals stay unchanged at the repository root. Astro builds responsive WebP derivatives.
- **Player guides:** `src/content/wiki/*.md`. Each file creates a wiki page.
- **Brand links and creator details:** `src/data/site.ts`.
- **Colours, layout and responsive design:** `src/styles/global.css` and `prose.css`.

Guide content was based on the mod repository at commit `ce4caaa83a49f0747a5e427c170ddc3ee60f6d2b`. Screenshots in `src/assets/screenshots/` are unmodified reference captures from that commit. The guide pages link to full source documentation. Review versions and rules when releasing new mod builds; the catalogue is deliberately maintained content rather than an unverified live version feed.

## Google indexing

Once public, configure `SITE_URL`, redeploy, and check `/robots.txt` and `/sitemap.xml`. Submit the production sitemap to **Google Search Console**. Search Console is free and a `pages.dev` address can be indexed. Domain ownership verification and Google's indexing decisions are separate from hosting. No analytics or third-party font requests are needed by the site.

## Validation

```sh
npm run check
npm run build
npm test
npm run test:content
npx playwright install chromium
npm run test:browser
```

The static checks validate generated routes, internal links and fragment targets, metadata, and draft exclusion. The content integration test temporarily creates release fixtures, builds to a temporary directory, verifies sorting/detail pages/sitemap behaviour, and removes the fixtures in `finally`. Browser checks cover filters, full-text search, keyboard navigation, mobile overflow, and serious/critical WCAG accessibility violations.

On machines with Chromium already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its path instead of downloading a browser. Build again after the content integration test to refresh the regular output. The test fixtures are never intended for publication.
