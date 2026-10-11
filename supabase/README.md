# EpicMKT Supabase setup

## 1. Link the project
```
npm i -g supabase
supabase login
supabase link --project-ref afdqkdjyhktbohcpayym
```

## 2. Database
```
supabase db push
```
Applies `0001_applications.sql` (tables, RLS, private `applications` bucket) and `0002_grants.sql` (table privileges, needed because "Automatically expose new tables" is off).

## 3. Secrets
Copy `supabase/.env.example` to `supabase/.env`, fill it in, then:
```
supabase secrets set --env-file supabase/.env
```
- `TURNSTILE_SECRET`: Cloudflare Turnstile secret key
- `APP_ENV=production`: makes a missing Turnstile secret fail closed. Use `development` locally to skip the check.
- `ALLOWED_ORIGIN`: your site origin, no trailing slash
- `IP_HASH_SALT`: any long random string
- `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL`: optional, emails are skipped when unset
- `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER`: Africa's Talking SMS for status codes. When `APP_ENV` is not `production`, the code is always `123456` and no SMS is sent.

## 4. Edge functions
```
supabase functions deploy submit-application --no-verify-jwt
supabase functions deploy finalize-application --no-verify-jwt
for f in status-request-otp status-verify-otp status-get status-correct status-resubmit status-payment-code; do
  supabase functions deploy $f --no-verify-jwt
done
```
`--no-verify-jwt` is required: publishable keys (`sb_publishable_...`) are not JWTs. `config.toml` sets the same.

## Payment details
Add the M-Pesa details shown to approved sellers (run once in the SQL editor, then edit as needed):
```
insert into site_settings (key, value) values ('mpesa', '{"type":"till","number":"YOUR_TILL","name":"EpicMKT"}')
on conflict (key) do update set value = excluded.value;
```
Use `"type":"paybill"` with an `"account"` field for a Paybill.

## 5. Seed
Copy `scripts/.env.example` to `scripts/.env`, add the project URL and the service role key, then from the repo root:
```
npm run seed
```
Seeds 32 categories, 64 plans (prices, limits, benefits and grouped features from `client/src/config/plans.seed.js`) and the terms and privacy text. Safe to re-run: it overwrites those rows, so run it before editing prices in the admin app, not after.

## 6. First admin
Create a user in Authentication, then in the SQL editor:
```
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```

## Before launch
- Have an advocate review the document rules in `client/src/data/categories.js` and the text in `client/src/data/legal/index.js`.
- `owner_id_number` is stored as plain text. Encrypt it with Vault or pgsodium.
- Optional cleanup of abandoned uploads (enable `pg_cron`):
```
select cron.schedule('purge-stale-uploads', '17 * * * *',
  $$ delete from public.applications where status = 'uploading' and created_at < now() - interval '24 hours' $$);
```

## Seller portal backend (phase S0)

### Database
`supabase db push` also applies `0004_core.sql` (businesses, items, item_media, faqs, offers, flags, reports, payments, messages, change_requests, audit_log, admin_notifications) and `0005_seller_portal.sql` (stock, price and history triggers, plan limits, seller RPCs, OTP and lockout helpers, the public `seller-media` bucket, realtime on `change_requests`). Both are safe to re-run.

Sellers have no direct write access to `businesses`. Every profile, change request, reply, pause and deletion goes through a `seller_*` RPC. Public read policies for the customer site are not part of S0.

### Functions
```
for f in seller-login seller-forgot-request seller-forgot-verify seller-otp-request seller-change-password seller-media-finalize seller-export-data; do
  supabase functions deploy $f --no-verify-jwt
done
```
Each function verifies the JWT itself. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. With `APP_ENV` not `production` the one-time code is always `123456` and no SMS is sent.

Seller sign-in uses the Auth email `<sellerid>@sellers.epicmkt.app`. Shared rules live in `shared/src/seller`; run `npm run sync:shared` after changing them (`--check` fails when the copies in `supabase/functions/_shared/synced` drift).

### Optional clean-up (pg_cron)
```
select cron.schedule('purge-seller-otps', '23 * * * *', $$ delete from public.seller_otps where created_at < now() - interval '1 day' $$);
select cron.schedule('purge-auth-attempts', '29 * * * *', $$ delete from public.auth_attempts where last_failure_at < now() - interval '1 day' $$);
select cron.schedule('purge-rate-limits', '41 * * * *', $$ delete from public.rate_limits where window_start < now() - interval '1 day' $$);
```

### Staging seed
`npm run seed:sellers` (after `npm run seed`) creates one Standard and one Premium seller with three items each and prints the Seller IDs and passwords to the terminal only. It refuses to run when `APP_ENV=production`.

### Tests
Needs a local PostgreSQL (set `TEST_DATABASE_URL`, default `postgres://postgres:postgres@127.0.0.1:5432/postgres`; the suite recreates an `epicmkt_test` database) and Deno on the path.
```
npm run test:seller-backend
```

## Media manager (phase S5)

Run `0007_media_manager.sql` after `0006`. It adds the media columns (alt, variant, poster, status, admin removal), a
race-free `media_limit_ok`, the publish rule (an item needs one ready **image** to be switched on; a video alone is not
enough), the `customer_item_media` view shoppers read, and tighter storage policies (`<business>/<item>/<media>/<file>`,
only inside the seller's own items).

Deploy the three functions: `seller-media-finalize` (attach and poster; reads the real bytes, ignores the declared type,
deletes the uploaded objects on any failure), `seller-media-remove` (one media, or all media of an item before the item is
deleted) and `seller-media-copy` (duplicate an item's media into new files and rows).

Limits come from `global_limits` (`photosPerItem`, `videosPerItem`; Standard 7 and 1, Premium 15 and 3). Videos: MP4 or WebM,
up to 45 seconds and 25 MB. iPhone HEVC videos are kept as `failed` so the seller sees why; shoppers never see failed or
processing media. Photos are re-encoded in the browser (this removes EXIF and GPS and fixes rotation) into WebP at
320/640/960/1280/1600 (and 2000 for zoom when the source is large enough).

Tests: `npm run test:db`, `npm run test:fn`, `npm test -w seller`, `npm test -w ui`. A real-browser check lives in
`seller/e2e/media.e2e.mjs` (see the header of that file).
