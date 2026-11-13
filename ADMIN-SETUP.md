# Admin panel

Open https://realmstudios.pt/admin/ to edit the homepage, brand, modpack settings, editorial catalogue, wiki and changelog. Saving commits directly to **realm-studios-site**; the existing Cloudflare Git integration publishes those commits.

Homepage fields are read from `src/data/home.json`. Version numbers and download files are generated from the release catalogue, so they are not editable as independent CMS fields. To refresh them, run **Refresh mod releases** in GitHub Actions or wait for its daily schedule.

The wiki Category field writes `category`, matching the content schema. Draft guides and releases are excluded from public routes and the sitemap. Select screenshot and artwork keys already defined by the site; invalid keys fail validation instead of silently creating broken content.

For Season 8, choose **group** for restricted distribution. Choose **public** only with an actual download URL. The latest published changelog supplies a release label when the version setting is empty.

## Authentication setup

1. Keep `realm-studios-site` connected as the Pages production branch, with `npm run build` and output `dist`.
2. Deploy the OAuth Worker described in [admin-auth/README.md](admin-auth/README.md), with its GitHub OAuth callback at the worker's `/callback` route.
3. Keep `public/admin/config.yml` pointed at the deployed worker and set the worker's `CMS_ORIGIN` to `https://realmstudios.pt`.

The editor uses the authenticated GitHub account allowed by the worker. Credentials belong in the worker's secret settings.
