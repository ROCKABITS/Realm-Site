# Visitor accounts

The header's **Account** link opens `/account/`. Visitors can sign in, create an account, confirm their email, recover a password and sign out. Their session survives a reload. Downloads and player guides remain public.

The same page has **Open the admin panel**, which opens the Realm Studios administration dashboard. Administration requires the authorised GitHub account checked by the OAuth Worker. Supabase users, editable user metadata and visitor session values do not grant administration permissions.

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

Visitor authentication uses Supabase Auth directly. It does not create profile tables or database policies, and the site does not request a service-role key. Enable the provider's abuse/rate-limit controls for your expected traffic. If a CAPTCHA is enabled later, its client challenge must also be integrated before using these forms.

## Verification

`tests/browser/account.spec.ts` intercepts auth requests to exercise valid/invalid sign-in, persistent sessions, sign-out, registration validation, confirmation instructions, recovery links, matching-password checks, disabled signups and service outages. It does not send emails, create real accounts or weaken administrator checks. Real email delivery and redirect configuration require the live-project check above.
