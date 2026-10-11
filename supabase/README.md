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
Applies every pending file in `supabase/migrations`, in order, and lists them first so you can confirm. `0001_applications.sql` holds the tables, RLS and the private `applications` bucket; `0002_grants.sql` the table privileges (needed because "Automatically expose new tables" is off). Later files are described in the phase sections below.

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
> **Only for a fresh project.** This overwrites categories, plans (prices and limits) and legal text. On a live project where prices have been edited, do not re-run it: to add or refresh the item fields use `npm run seed:item-templates` (see "Seller catalog (phase S1)").

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

## Seller catalog (phase S1)

Adds the catalog data-entry fields (`0006_catalog_entry.sql`), per-category item fields (`0007_item_templates.sql`) and
atomic section rename and remove (`0008_item_sections.sql`). All three are safe to re-run. `0006` and `0007` add columns
and constraints only; no existing data is changed or removed.

### Upgrading a live project, in this order

1. **Preflight (read-only).** Paste `supabase/preflight-catalog.sql` into the SQL editor and run it. `0006` adds its
   checks as `NOT VALID`, so old rows are not rejected when it runs, but PostgreSQL checks the whole row on every later
   update. An old item with a name over 80 characters, a price with cents, a top price not above the price, or a sale
   price not below the price would refuse ordinary edits (even hiding it) until fixed. An empty result means nothing to do;
   otherwise fix the listed items first.
2. **Apply the migrations.** `supabase db push` (this applies `0006`, `0007` and `0008` after whatever you already have).
3. **Fill in the item fields.** `0007` gives every category an empty `item_template`, so until this step no category shows
   extra item fields (nothing breaks). Use one of:
   - **SQL editor, no credentials:** run `supabase/seed-item-templates.sql`. It prints two checks: ids that are not categories
     (expect no rows) and how many categories now have item fields.
   - **Script:** with `scripts/.env` filled in, `npm run seed:item-templates -- --dry` to preview, then
     `npm run seed:item-templates`.

   Both set `categories.item_template` and nothing else, so edited plan prices, business templates and legal text are safe.
   Do not use `npm run seed` for this on a live project. After changing `shared/src/seller/item-templates.js`, regenerate the
   SQL with `npm run gen:item-templates-sql`; the tests fail if the committed file is out of date.
4. **Seller app environment.** The upgrade page links to EpicMKT using the same variables as the public contact page. Set
   `VITE_CONTACT_EMAIL`, `VITE_CONTACT_PHONE`, `VITE_CONTACT_WHATSAPP` and `VITE_SUPPORT_HOURS` for the seller app's build
   (see `seller/.env.example`). Without them the page says contact details are not set up instead of showing links.

### Check it worked
```
select column_name from information_schema.columns where table_name = 'categories' and column_name = 'item_template';
select proname from pg_proc where proname in ('rename_item_section', 'remove_item_section');
select count(*) filter (where jsonb_array_length(item_template) > 0) as categories_with_item_fields from public.categories;
```
Expect one row, two rows, and a count of 28 (four categories deliberately have none: barbershop, salon-beauty, gym-fitness,
mpesa-airtime-agent).

### Plan upgrades
There is no plan-change request in the database (`seller_request_change` does not accept a plan). The seller plan page therefore
sends sellers to EpicMKT by email, WhatsApp or phone, with their name, Seller ID, current plan and wanted plan filled in.

