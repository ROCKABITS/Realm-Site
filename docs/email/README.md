# Realm Studios authentication email

Target sender: **Realm Studios <noreply@realmstudios.pt>**.

Supabase sends confirmation/recovery messages, so the visible sender is configured in **Supabase Authentication → Email → SMTP Settings**, not in the public website's JavaScript or Cloudflare build variables. Changing or deploying this repository does not activate an SMTP provider or update the hosted Supabase email templates.

## Activate a sender

Use an existing transactional SMTP service if one is already available. The Resend example below is a recommended option when starting without one.

1. In [Resend Domains](https://resend.com/domains), add `realmstudios.pt` and enable sending. Copy the DNS records Resend actually provides into the domain's Cloudflare DNS settings. Wait until the domain is verified. The record names, values and any priorities must come from the provider; do not guess or copy someone else's DKIM key.
2. Preserve existing mail records. Do not add a second SPF record at the same DNS name or replace the domain's receiving MX records. Resend normally puts its return-path mail records on a sending subdomain; use the exact names shown for this domain.
3. Create a Resend API key authorised to send from this verified domain. Keep the key private.
4. In Supabase, enable custom SMTP and enter:

   | Field | Value |
   | --- | --- |
   | Sender name | `Realm Studios` |
   | Sender email | `noreply@realmstudios.pt` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | The Resend API key, entered directly in this private Supabase setting |

   The SMTP password does **not** belong in `PUBLIC_` variables, frontend code, screenshots or this repository. Existing Supabase publishable keys remain the website's public configuration.
5. Save the SMTP settings. Check the account's email rate limits for the expected traffic. A website redeploy is not required for the new sender to take effect.
6. Request a confirmation/recovery email for your own account and check the visible sender, successful delivery and the resulting account flow. No real email is sent by the repository tests or preview commands.

Verifying a sending domain does not create a receiving mailbox. This example deliberately uses a `noreply` sender. Configure a mailbox or forwarding separately if a reply address is wanted.

Official references: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Resend with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp).

## Optional branded message bodies

These HTML files use the site's forest/gold colours, inline styles, table layout and a text wordmark that does not depend on email clients displaying an SVG image:

| Supabase template | Subject | HTML source |
| --- | --- | --- |
| Confirm signup | `Confirm your Realm Studios account` | [confirm-signup.html](confirm-signup.html) |
| Reset password | `Reset your Realm Studios password` | [reset-password.html](reset-password.html) |

Copy each HTML file into its corresponding Supabase email template. Keep `{{ .ConfirmationURL }}` in both links; Supabase replaces it with the current request's secure confirmation or recovery URL. Do not replace it with a fixed site URL or a preview token. The existing website redirect allowlist still applies.

The other Supabase email types can keep their current bodies; custom SMTP applies the chosen sender across the project's authentication emails. Message-body branding and sender activation are separate settings.
