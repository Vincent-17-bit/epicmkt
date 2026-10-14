# EpicMKT Supabase backend

Migrations, edge functions and tests for the applications, seller and admin parts of EpicMKT.
Every variable is listed, with where it goes, in the repository root `.env.example`.

## Admin backend setup

### 1. Requirements

- Supabase CLI and a project (or a local Postgres 15+ for the tests).
- Node 22.18 or newer (it runs `scripts/seed.ts` and the `.ts` helpers directly) and Deno 2 (edge functions and their tests).

### 2. Database

```bash
supabase db push        # runs migrations 0001 to 0008 in order
```

`0008_admin.sql` is additive. It never re-declares a table that an earlier migration owns; it adds roles, the audit
columns, the outbound message log columns, three admin-only tables (`message_templates`, `site_config`, `content_pages`),
role-aware policies and the admin RPCs. It is safe to run again.

The schema the admin functions must code against (these are the real columns, not an idealised design):

| Area | What to know |
| --- | --- |
| Roles | `admins.role` is `owner`, `reviewer`, `finance` or `support`. The owner passes every role check (`public.has_role()` in SQL, `requireAdmin()` in TypeScript). Applications and their documents: owner and reviewer only. Catalogue and settings: owner only. Payments: every admin reads, owner and finance write. |
| Audit | `audit_log` is append-only for browser roles (they can read, never write). Only the service role and `security definer` functions append. `entity/entity_id` and `target_type/target_id` mirror each other (trigger), `before`, `after`, `reason`, `actor_email` and `ip_hash` are columns. |
| Payments | `amount_kes`, `status` is `submitted`, `confirmed` or `rejected`, `kind` is `first`, `renewal`, `upgrade` or `category_change`, `mpesa_code` is 10 letters/digits. A code can be used once unless the earlier payment was rejected. Confirm and reject through `payment_apply_confirmation` / `payment_apply_rejection`. |
| Messages | One table. `channel = 'in_app'` rows are seller notifications (sellers can read only these). `sms` and `email` rows are the outbound log (`status` queued, sent, delivered, failed; `error`, `cost_kes`, `attempts`, `provider_id`). |
| Flags / reports | Flags: `open`, `replied`, `resolved`. Reports: `open`, `reviewed`, `dismissed`. |
| Change requests | `field` is one of `name`, `category_id`, `phone`, `town`, `pin`, `licence`; `old_value` / `new_value` are text; one pending request per business and field. |
| Grace | Fixed at one day everywhere (`listing_state()`, `shared/src/billing.js`, `_shared/dates.ts`). It is not a setting. |
| Seller export | `seller-export-data` lists the columns it returns from `messages` and `audit_log`, so staff-only data never leaves in a seller's export. |

<<<<<<< HEAD
### 3. First admin
=======
```bash
supabase functions deploy admin-decide-application --no-verify-jwt
supabase functions deploy admin-confirm-payment --no-verify-jwt
supabase functions deploy admin-reset-seller-password --no-verify-jwt
supabase functions deploy admin-message --no-verify-jwt
supabase functions deploy dispatch-messages --no-verify-jwt
supabase functions deploy daily-lifecycle --no-verify-jwt
supabase functions deploy admin-export --no-verify-jwt
```
>>>>>>> 26402d0 (Reconcile admin and seller schemas; renewal messages; spec and test scripts)

Create the user in Supabase Auth, then make them the owner:

```sql
insert into public.admins (user_id, role, email, display_name)
select id, 'owner', email, 'Your Name' from auth.users where email = 'you@example.com'
on conflict (user_id) do update set role = excluded.role, email = excluded.email, display_name = excluded.display_name;
```

(`node scripts/seed-admin.mjs` prints this with your `ADMIN_EMAIL` and `ADMIN_NAME`.)

<<<<<<< HEAD
### 4. Secrets

```bash
cp .env.example supabase/.env      # keep the [functions] block, fill it in
supabase secrets set --env-file supabase/.env
```

The service role key lives only here. The browser gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, nothing else.
All admin writes go through edge functions (which check the JWT, the `admins` row and the role) or through the admin RPCs
(which check the role themselves).

### 5. Mock mode and real messages

`MESSAGING_MODE` decides whether SMS and e-mail are real:

- `mock` (the default outside production): nothing is sent, the call succeeds with a `mock-...` provider id and an estimated cost, so the message log and dashboards work in development.
- `live` (the default when `APP_ENV=production`): Africa's Talking (`AT_API_KEY`, `AT_USERNAME`, optional `AT_SENDER`; `AT_USERNAME=sandbox` uses the sandbox) and Resend (`RESEND_API_KEY`, `MAIL_FROM`). A missing secret is reported as `sms_not_configured` / `email_not_configured`, never as a fake success.

The admin web app runs on built-in mock data while `VITE_SUPABASE_URL` is empty.

### 6. Shared code (`supabase/functions/_shared/`)

| Module | Purpose |
| --- | --- |
| `admin.ts` | `requireAdmin(req, db, roles?)` (`auth.getUser` then the `admins` row then the role: 401, 403, or 500 on a database failure) and `adminHandler({ name, roles, rate }, fn)` (preflight, POST only, auth before any input is read, rate limit, one error mapping, no internal error text in answers). |
| `schemas.ts` | zod helpers: `parseBody` (400 bad JSON, 422 `invalid_input` with paths and messages but never the submitted values), `mpesaCode`, `kenyanPhone`, `reason`, `pagination`, `isoDay`, status lists. |
| `ratelimit.ts` | `hitRateLimit` / `enforceRateLimit` over `hit_rate_limit()`; a failing limiter is a 500, not a silent pass. |
| `audit.ts` | `writeAudit` (redacts secrets, caps size, hashes the IP). Call it before answering; if it fails the action fails. |
| `http.ts` | `json()` (no-store, nosniff, CORS), `sendSms` / `sendMail` (thin wrappers over `providers.ts`). |
| `providers.ts` | `deliverSms` / `deliverEmail` with mock mode. Africa's Talking answers HTTP 201 even when a recipient fails, so the per-recipient status decides. |
| `dates.ts` | EAT calendar helpers: `addCalendarMonth` (31 Jan becomes 28 Feb), `renewalPeriod` (early or in-grace renewals continue the paid period), `listingState`, `nairobiMidnight`. |
| `ids.ts` | `randomId` over a 32 character alphabet without 0/O/1/I (unbiased), `generateReferenceNo`, `generateSellerId`, `generatePassword`. |
| `sms.ts` | `countSms`: GSM-7 (160 / 153) and Unicode (70 / 67) segments, extension characters, emoji, never splitting a pair; `toGsmFriendly`. |
| `roles.ts`, `errors.ts` | Role list and `roleAllowed`; `HttpError`. |

### 7. Demo data

```bash
cp scripts/.env.example scripts/.env     # set SEED_DATABASE_URL
npm run seed                             # catalogue (categories, plans, legal) if you have not already
npm run seed:admin                       # 66 businesses, 280 items, 40 payments, ...
npm run seed:admin -- --reset            # remove the demo rows and load them again
npm run seed:admin -- --dry-run          # print the numbers, write nothing
```

It creates 66 businesses (pending, live active / expiring / in grace / lapsed, paused, suspended, expired, deleted),
280 items (213 with at least one problem: stale price, no price, bad sale price, out of stock, no photo, hidden by an
admin, open flag, open report), 40 payments (24 confirmed, 8 submitted, 8 rejected, one M-Pesa code used twice), 12
change requests, 10 reports, 34 flags, 26 applications (every status), and 60 SMS/e-mail log rows of which 19 failed.
Demo rows are recognisable (`ES99xxxx` seller IDs, `demo-` slugs, `EPM-YYYY-DEMOxx` references), so `--reset` removes
exactly those. It runs in one transaction, refuses `APP_ENV=production`, and the same `--seed` always gives the same data.
Demo businesses have no login (`user_id` is empty) and photos point at paths that do not exist in storage.

### 8. Tests

```bash
npm run test:fn        # Deno: function tests + shared module tests (dates, SMS, IDs, auth, audit, providers)
npm run test:db        # Postgres: migrations, RLS and roles, audit, RPCs, TypeScript/SQL date parity, the seed
npm run test:admin-backend
```

`test:db` needs a Postgres it can create a database in (`TEST_DATABASE_URL`, default `postgres://postgres:postgres@127.0.0.1:5432/postgres`).
The DB test files run one at a time because they share one database name.

### 9. Edge functions

The functions that exist today for the admin area (`admin-decision`, `admin-confirm-payment`, `admin-message`,
`admin-reset-seller-password`, `dispatch-messages`, `daily-lifecycle`, `admin-export`) are placeholders written before
the schema above was settled. **Do not deploy them as they are.** Several write columns that do not exist (for example
`payments.amount`, `payments.months`, `audit_log` rows without `actor_role`) and `admin-export` is not a function yet.
They are to be rewritten on `adminHandler`, `parseBody`, `writeAudit` and the RPCs described above.
`admin-proof-url`, the seller functions and the application functions are complete and tested.

```bash
supabase functions deploy admin-proof-url --no-verify-jwt   # the function checks the admin JWT itself
```
=======
- All browser writes must go through edge functions and RPCs.
- Admin and audit access are enforced using `public.is_admin()` and `public.has_role()`.
- Realtime is enabled for the admin dashboard tables.
- `supabase/pending/0008b_admin_content_tables.sql` holds admin statements for items, item_media, faqs, offers, flags, reports and change_requests that do not match the seller schema. It is not run by migrations.
>>>>>>> 26402d0 (Reconcile admin and seller schemas; renewal messages; spec and test scripts)
