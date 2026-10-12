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

## Subscription, notifications and admin questions (phase S1)

`supabase db push` also applies `0006_subscription_notifications.sql`: payment status, M-Pesa code, receipt numbers, category quotes, message types, flag questions, `flag_attachments` and the private `seller-proofs` bucket (8 MB, pdf/jpeg/png/webp, no policy for any user).

### M-Pesa Paybill
```
insert into site_settings (key, value) values ('mpesa', '{"type":"paybill","number":"YOUR_PAYBILL","name":"EpicMKT"}')
on conflict (key) do update set value = excluded.value;
```
Sellers cannot read `site_settings`; `seller_payment_instructions()` returns the number, the account number to type and the exact amount, all computed on the server. Without this row the page says "We will send you the payment details by SMS shortly."

- First payment: account = the application's `reference_no`, amount = `price_at_submission`.
- Renewal: account = Seller ID, amount = the current plan price.
- Upgrade and dearer category: account = Seller ID, amount = prorated difference (`category_change_quote`).

### Confirming payments (admin or automatic)
Both paths end in one function, so the seller's page needs no change when matching is automated:
- Admin: `select admin_confirm_payment('<payment id>')` or `admin_reject_payment(id, 'reason')`.
- Automatic: a Daraja C2B callback (service role) calls `payment_match_incoming(code, amount_kes, account)`. It confirms a submitted row when code, account and amount agree; otherwise it returns the reason and leaves the row for the admin.
The seller page listens to its own `payments` and `businesses` rows over realtime and refetches.

### Functions
```
for f in seller-proof-upload-url seller-proof-finalize admin-proof-url proofs-purge; do
  supabase functions deploy $f --no-verify-jwt
done
supabase secrets set CRON_SECRET=<long random string>
```
Upload flow: `seller-proof-upload-url` (ownership, open flag, 3 files, 8 MB, one-time signed URLs, random names) then the browser uploads, then `seller-proof-finalize` (real type by magic bytes, PDF scan, deletes everything pending on any failure), then `seller_reply_flag`. Admins open a proof with `admin-proof-url` (60 second signed URL, audit row written first).

### Schedules (pg_cron)
```
select cron.schedule('billing-notices', '5 3 * * *', $$ select public.generate_billing_notices() $$);
-- proofs: call the proofs-purge function daily with the x-cron-secret header (pg_net or any scheduler)
```
`generate_billing_notices()` writes the 7, 3 and 1 day reminders, the grace notice and the expiry notice, once each.

### Tests
`npm run test:all` runs the database, function, seller UI and client suites.
