# Admin OAuth Worker

This Worker is the GitHub sign-in bridge used by Decap CMS. It allows only the GitHub account configured in ALLOWED_GITHUB_LOGIN to edit the repository.

## Deploy

1. Create a GitHub OAuth App. Set its Authorization callback URL to https://YOUR-WORKER-HOST/callback.
2. Install Wrangler and authenticate: npm install --global wrangler; wrangler login.
3. From this directory, run wrangler secret put GITHUB_CLIENT_ID and paste the OAuth App client ID.
4. Run wrangler secret put GITHUB_CLIENT_SECRET and paste the OAuth App client secret. Both values stay in Cloudflare.
5. Run wrangler deploy.
6. Copy the deployed workers.dev URL into base_url in ../public/admin/config.yml, with no trailing slash. Use the same host in the GitHub callback URL.

CMS_ORIGIN and ALLOWED_GITHUB_LOGIN are configured in wrangler.jsonc. The default editor is ROCKABITS and the site origin is https://realmstudios.pt. Change the allowed login only to grant access to a different account. If using a custom domain or another workers.dev account subdomain, use that exact host in both places above.

The OAuth token is checked against the allowed GitHub username before it is returned to the admin panel. Revoke the OAuth App authorization in GitHub to remove access.
