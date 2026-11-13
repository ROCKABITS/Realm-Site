# Visitor accounts

The header's **Account** link opens `/account/`. Visitors can sign in, create an account, confirm their email, recover a password and sign out. Their session survives a reload. Downloads and player guides remain public.

The same page has **Open the admin panel**, which opens the Realm Studios administration dashboard. Administration requires the authorised GitHub account checked by the OAuth Worker. Supabase users, editable user metadata and visitor session values do not grant administration permissions.

## Signed-in features

- **Profile & setup**: a private nickname, one of six avatar presets, Minecraft version and loader. A matching download must fit both installation preferences. Mod pages link directly to the matching edition when there is one.
- **Your collection**: saved mods and player guides, with direct links and removal controls. Use the bookmark on catalogue cards or **Save** on a mod or guide page.
- **Following**: follow mods from their detail pages. The account shows the current release of each loader/Minecraft edition, highlights versions not yet acknowledged and lets the user mark them as read. A new follow starts with the current releases marked read. Updates are shown on the website; no notification emails are sent by this feature.
- An explicit anonymous Save/Follow click can be completed after sign-in and returns the visitor to that mod or guide. The intent is stored only in the current tab, expires after 15 minutes and cannot be created through URL parameters. Return paths are limited to local mod and guide pages.

These small, private preferences are saved under the `realm_studios` namespace in the authenticated user's Supabase Auth metadata. They sync across sessions/devices with the existing project; no SQL migration, new table, storage bucket or additional key is required. Other provider metadata is preserved. Only public catalogue data is embedded in the built account page; user preferences are fetched after the session is verified with Supabase.

Writes fetch the latest authenticated user, apply a specific change, and wait for server confirmation before showing success. Writes are queued in the tab and coordinated between supporting same-origin tabs with Web Locks. A changed user identity cancels the action. Simultaneous saves from separate devices use Supabase Auth's normal last-write behavior; use a database with atomic operations if the feature grows into shared/public lists or larger collections. This metadata must never be used as an administrator role or permission check.

## Connect a live Supabase project

The production project is `grittvzryidrzuxqbpst.supabase.co`; its email authentication and signup settings were confirmed active on 2026-11-13 after the production configuration was updated. The account page checks the public authentication settings before enabling visitor forms and shows an unavailable message if the project cannot be reached. The administrator link remains usable. The steps below also apply when replacing the project.

1. Use the existing Supabase project, or create a replacement project you control.
2. Under **Authentication → Sign In / Providers**, enable Email and allow new signups. Enable email confirmation and configure your email sender/SMTP before opening registration to visitors. Supabase's built-in sender has restrictions and is intended for development; use a production sender for public registrations.
3. Under **Authentication → URL Configuration**, set Site URL to `https://realmstudios.pt`. Add these exact Redirect URLs:
   - `https://realmstudios.pt/account/`
   - `https://realmstudios.pt/account/reset/`
4. Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` in **Cloudflare Pages → realmstudios → Settings → Variables and Secrets**, for Production. Use the project's **publishable key** (or legacy anon key), never a service-role/secret key. Cloudflare build variables override the old checked-in `.env` values. Redeploy after changing either value because Astro embeds public configuration at build time.
5. Try registration with your own email, follow the confirmation link, sign in, sign out, then request and follow a recovery email. Check that administration still accepts only the authorised GitHub account.

For local development, put the public values in `.env.local` and allow `http://localhost:4321/account/` and `http://localhost:4321/account/reset/` as development redirects. Preview domains need their own explicit redirect allowlist entries if you want working emails on previews; avoid a broad wildcard for unrelated hosts.

Visitor authentication and private preferences use Supabase Auth directly. The site does not create database tables/policies or request a service-role key. If a CAPTCHA is enabled later, its client challenge must also be integrated before using these forms.

## Verification

`tests/browser/account.spec.ts` intercepts auth requests to exercise valid/invalid sign-in, persistent sessions, sign-out, registration validation, confirmation instructions, recovery links, matching-password checks, disabled signups and service outages. It does not send emails, create real accounts or weaken administrator checks. Real email delivery and redirect configuration require the live-project check above.

`tests/browser/member.spec.ts` exercises profile persistence in separate browser contexts, saved mods/guides, following and edition-specific read state, post-login intents, failed/queued writes, changed identities, sign-out/account switching, compatibility, HTML-safe profile strings, narrow layouts and accessibility. Auth requests use an isolated fixture; tests do not alter real visitor accounts. `tests/member.test.mjs` covers metadata validation and the pure preference/compatibility operations.
