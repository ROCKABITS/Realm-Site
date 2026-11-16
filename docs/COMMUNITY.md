# Profile photos and community feedback

The website source and production branch is `realm-studios-site`. Supabase project configuration uses the existing public `PUBLIC_SUPABASE_URL` and publishable `PUBLIC_SUPABASE_ANON_KEY`; a secret or service-role key must never be added to the website.

## Visitor experience

- Account → Profile & setup: choose a JPEG, PNG or WebP photo, preview it, and save. Images are centre-cropped and resized to 384 × 384 WebP in the browser. The source limit is 8 MB / 40 megapixels; the upload limit is 512 KB. Remove photo returns to nickname initials.
- Mod and guide pages: read comments and totals without signing in. Sign in to like, unlike or comment. Likes and saved items are separate features.
- Authors can edit or delete their own comments. Comments are plain text, 1–2,000 characters, with 30 seconds between new posts and 50 posts per UTC day. Deleting a comment does not reset that limit.
- Names and photos become public only when the user explicitly posts a comment. Collections, followed mods, setup and email remain private. Saving a profile updates the identity on previously published comments.

## Database and storage

Apply the two committed migrations in order for a new project. Their versions match the production migration history. They create `realm_profiles`, `realm_likes`, `realm_comments`, private moderator/rate-limit tables, controlled RPCs and a private `realm-profile-photos` Storage bucket. Reapplying both preserves existing feedback.

Public RPCs are invokers; privileged implementations live in the unexposed `realm_private` schema with explicit execute grants. Writes verify `auth.uid()` and author/moderator ownership on the server. No authorization decision uses user-editable metadata. Direct public table writes are revoked and all tables have RLS. Public feeds return 21 rows for a 20-row page plus an older-results indicator, using `(created_at, id)` cursors.

Photo paths are immutable UUID filenames under the authenticated user's UUID. Only the owner can upload/delete their objects. Unpublished photos are readable only by the owner and moderators. A photo attached to a visible comment can be read by visitors. Signed image links last five minutes; already-issued links can remain valid until expiry after a photo is removed or a comment hidden. Files are replaced without granting Storage update/upsert access. Old files are deleted after metadata and public profile synchronization succeed.

## Moderation

Admin → Feedback lists comments across mods and guides. Hide removes a comment from public feeds; restore publishes it again; delete is permanent. The admin panel still verifies its GitHub owner. Moderation also requires signing into the website with a Supabase account in `realm_private.moderators`; GitHub panel access alone does not grant database privileges. The site's owner account has been configured separately, without committing its email or UUID.

To add an explicitly approved moderator, verify the intended user's Auth UUID in Supabase and run this using project-owner access:

```sql
insert into realm_private.moderators(user_id)
values ('REPLACE_WITH_VERIFIED_AUTH_USER_UUID'::uuid)
on conflict do nothing;
```

Never grant the first registrant, infer the role from a nickname, or put it in `user_metadata`. Remove a moderator by deleting their exact UUID from the protected table.

## Verification

`npm test` includes PostgreSQL engine tests using PGlite for SQL privileges, anonymous access, private photo ownership, public identity opt-in, unique likes, edit/delete permissions, rate limits and moderator role checks. `npm run test:browser` covers cross-account feedback, photo preparation/upload/replacement/removal, error recovery, pagination, accessibility and mobile layouts using local fixtures. Tests do not create real users, publish production comments or send emails.
