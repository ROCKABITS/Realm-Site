# Admin OAuth Worker

This Worker is the private-token bridge used by Decap CMS. It allows only the GitHub account configured in ALLOWED_GITHUB_LOGIN to edit the repository.

## Deploy

1. Create a GitHub OAuth App. Set its Authorization callback URL to https://YOUR-WORKER-HOST/callback.
2. Install Wrangler and authenticate in your terminal: npm install --global wrangler; wrangler login.
3. From this directory, set the OAuth client secret with wrangler secret put GITHUB_CLIENT_SECRET, then run wrangler deploy.
4. Set GITHUB_CLIENT_ID as a Worker variable. Keep the client secret in Cloudflare Worker secrets.
5. Copy the deployed workers.dev URL into base_url in ../public/admin/config.yml, with no trailing slash. Use the same host in the GitHub callback URL.

CMS_ORIGIN and ALLOWED_GITHUB_LOGIN are configured in wrangler.jsonc. The default editor is ROCKABITS and the site origin is https://realmstudios.pt. Change the allowed login only to grant access to a different account. If using a custom domain or another workers.dev account subdomain, use that exact host in both locations above.

The OAuth token is checked against the allowed GitHub username before it is returned to the admin panel. Revoke the OAuth App authorization in GitHub to remove access.
