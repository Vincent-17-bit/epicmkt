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
