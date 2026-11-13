# Realm Studios administration

Open **Account → Open the admin panel** on the site, or visit https://realmstudios.pt/admin/. The panel is in Portuguese; the text you publish on the public site can remain in English.

## Everyday editing

- **Visão geral**: counts, shortcuts and recent changes.
- **Mods**: search individual mod cards, filter by category and open one mod. Edit its presentation, content and images in separate sections. Select logos and screenshots by thumbnail. Versions and downloads remain generated from the release catalogue.
- **Guias da wiki** and **Novidades**: search published pages or drafts. Use the visual editor for formatted text, lists, links and tables, or switch to Markdown. New pages start as drafts. Uncheck **Guardar como rascunho** when ready to publish.
- **Página inicial**: separate sections for the welcome message, collection, wiki and modpack.
- **Modpack**: name, displayed version and public/group access. A public download needs a valid URL; an empty version uses the latest published changelog.
- **Definições**: studio name, creator, site description and external links.

The preview shows the current form before saving. **Ver página publicada** opens the existing public page. **Guardar e publicar** saves the content and shows its publication state; the build and Pages checks determine when it is published. A saved draft stays out of public routes and search.

Unsaved edits prompt before leaving. A local draft in the current browser tab can survive a reload. **Exportar rascunho** downloads a copy. If another edit changed the same source file, the panel keeps your input and reports the conflict instead of overwriting that edit. Reopen the page and compare with your exported copy.

## Authentication and publication

The existing GitHub OAuth Worker checks the authorised GitHub account before handing a token to the panel. The panel verifies the account again through GitHub before loading content. The token stays in memory and, when available, `sessionStorage` for this tab; it is not shared with visitor account code. **Terminar sessão** clears the panel session. GitHub's API enforces permissions on every read and save.

The panel reads current repository content and saves with the file's SHA to **realm-studios-site**. The existing Cloudflare Pages Git integration publishes that branch. No new service or server configuration is needed for the redesigned panel.

Keep Pages configured with `npm run build`, output `dist` and production branch **realm-studios-site**. Keep `CMS_ORIGIN=https://realmstudios.pt` and the authorised login in the Worker configuration. See [admin-auth/README.md](admin-auth/README.md) for deployment and the OAuth callback.

The previous Decap editor remains at `/admin/legacy/`, linked from **Definições → Abrir editor avançado**. It supports the previous media upload and collection controls and uses the same OAuth Worker and `/admin/config.yml`.

## Content sources

- `src/data/home.json`: homepage copy.
- `src/data/site.json`: brand, links and modpack settings.
- `src/data/mods.json`: editorial mod information; saving one card preserves other entries.
- `src/content/wiki/*.md` and `src/content/changelog/*.md`: Markdown and frontmatter. Unknown metadata and local image references are preserved when editing.
- `src/data/releases.json`: generated release information; refresh with the scheduled **Refresh mod releases** workflow.

Visitor Supabase authentication does not grant administrator permissions. See [ACCOUNT-SETUP.md](ACCOUNT-SETUP.md) for visitor accounts.

## Verification

Browser tests exercise the popup handshake, wrong-account rejection, mod editing, draft recovery, navigation guards, conflicting saves, visual Markdown editing, preserved image paths/tables, preview sanitisation, homepage/modpack forms, narrow layouts and accessibility. Repository reads and writes are intercepted; tests do not publish content to GitHub.
