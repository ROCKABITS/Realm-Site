# Admin panel setup

Open https://realmstudios.pt/admin/ to edit homepage copy, brand and modpack settings, the mod catalogue, wiki guides, and changelog posts. Saving commits directly to the realm-studios-site branch. Uploaded images are stored in public/uploads/.

## One-time setup

1. Connect this repository to Cloudflare Pages with realm-studios-site as the production branch. Use npm run build and dist. Then each admin save publishes automatically.
2. Deploy the OAuth Worker described in admin-auth/README.md and create a GitHub OAuth App callback at https://YOUR-WORKER-HOST/callback.
3. Replace the placeholder Worker host in public/admin/config.yml with its deployed workers.dev URL.

If the Cloudflare Pages project is Direct Upload, admin edits still save to GitHub, but the site needs a new build and upload to reflect them.
