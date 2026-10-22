# EpicMKT Supabase backend

Migrations, edge functions and tests for the applications, seller and admin parts of EpicMKT.
Every variable is listed, with where it goes, in the repository root `.env.example`.

## Admin backend setup

### 1. Requirements

- Supabase CLI and a project (or a local Postgres 15+ for the tests).
- Node 22.18 or newer (it runs `scripts/seed.ts` and the `.ts` helpers directly) and Deno 2 (edge functions and their tests).

### 2. Database

```bash
supabase db push        # runs every file in supabase/migrations, in number order
```

`0008_admin.sql` is additive. It never re-declares a table that an earlier migration owns; it adds roles, the audit
columns, the outbound message log columns, three admin-only tables (`message_templates`, `site_config`, `content_pages`),
role-aware policies and the admin RPCs. It is safe to run again.

### Migration numbers

Supabase records a migration by its numeric prefix, so a number is permanent: never rename, renumber or reuse one after
it may have been applied anywhere. `npm run check:migrations` (part of `npm run test:seller-backend`) fails on a
duplicate number, a number out of order, an unexplained gap, a header that names another file, and a reference in this
file to a migration that does not exist.

Numbers `0032`, `0033` and `0034` have no file, on purpose. Nothing was ever committed under them on any branch. The
public-exception and item-video migrations were first written as `0024` to `0026`, and when `main` gained the admin
migrations `0024` to `0031` they were renumbered straight to `0035` to `0037` (commit `45a3b85`). The gap is listed
in `RESERVED` in `scripts/check-migrations.mjs`. Do not add placeholder files for it: a project that already applied
`0035` or later would report a migration "inserted before the last one" and refuse a plain `supabase db push`.

New migrations take the next free number after `0038`.

### Is every migration in the live database?

Run `supabase/check-applied.sql` in the SQL editor of the live project (it only reads).

- Part 2 lists every function and table the apps call. Any `false` is a missing migration.
- Part 3 probes migrations `0029` to `0038` by what they changed. Every row must be `true`.
- Part 1 shows what the CLI recorded. Versions `0001` to `0031` and `0035` to `0038` are expected.

**Fixing the record.** If Part 1 lists `0024_public_exceptions`, `0025_exception_overnight` or `0026_public_item_videos`,
the database was migrated before the renumbering. Those rows now stand in for the admin migrations that share the
numbers `0024` to `0026`, so the CLI will skip them. Run `supabase migration repair --status reverted 0024 0025 0026`,
then `supabase db push --dry-run` to see what it would apply, then `supabase db push --include-all`. `0035` to `0037`
only create or replace views and functions, so applying them again changes nothing. Finish by running Part 2 and Part 3.

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

### 3. First admin

Create the user in Supabase Auth, then make them the owner:

```sql
insert into public.admins (user_id, role, email, display_name)
select id, 'owner', email, 'Your Name' from auth.users where email = 'you@example.com'
on conflict (user_id) do update set role = excluded.role, email = excluded.email, display_name = excluded.display_name;
```

(`node scripts/seed-admin.mjs` prints this with your `ADMIN_EMAIL` and `ADMIN_NAME`.)

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

The fixed development OTP `123456` (no SMS) is used only when `APP_ENV` is not `production` AND messaging is in `mock` mode. Production, or any environment with `MESSAGING_MODE=live`, issues a random code and sends it by SMS. Before switching it on, make sure `RESEND_API_KEY` and `MAIL_FROM` are set; the `SUPABASE_*` secrets are provided by Supabase. A failed OTP SMS is logged as `otp_sms_failed` with the provider error.

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

`admin-decide-application`, `admin-confirm-payment` and `admin-reset-seller-password` are rewritten on the canonical
columns (migrations 0008 to 0010) and tested. `admin-message`, `dispatch-messages`, `daily-lifecycle` and `admin-export`
are implemented on migration `0021_messaging.sql`; their contracts are in `docs/b0d-contracts.md` (derived from the
schema and tests, not from spec section 5: verify before relying on them).
`admin-proof-url`, the seller functions and the application functions are complete and tested.

### Messaging jobs

Schedule the two jobs once per environment with `supabase/cron/schedule.sql` (setup steps are in its header):
`dispatch-messages` every minute, `daily-lifecycle` at 07:00 Nairobi (04:00 UTC). Both accept the `x-cron-secret`
header (`CRON_SECRET`), and an admin JWT for manual runs.

```bash
supabase functions deploy admin-proof-url --no-verify-jwt   # the function checks the admin JWT itself
```

```bash
supabase functions deploy admin-decide-application --no-verify-jwt
supabase functions deploy admin-confirm-payment --no-verify-jwt
supabase functions deploy admin-reset-seller-password --no-verify-jwt
supabase functions deploy admin-message --no-verify-jwt
supabase functions deploy admin-export --no-verify-jwt
supabase functions deploy dispatch-messages --no-verify-jwt
supabase functions deploy daily-lifecycle --no-verify-jwt
```

- All browser writes must go through edge functions and RPCs.
- Admin and audit access are enforced using `public.is_admin()` and `public.has_role()`.
- Realtime is enabled for the admin dashboard tables.

## Opening-hours exceptions

One-off changes to a shop's weekly hours: a day it is closed, or a day it opens at different times. They are stored in
`businesses.exceptions` (jsonb, default `[]`), added in `0004_core.sql`, written by the functions in
`0007_exceptions.sql`, widened for overnight hours in `0036_exception_overnight.sql` and shown to customers by
`0035_public_exceptions.sql`.

### Shape

```json
[
  { "id": "3f0c2a52-…", "date": "2026-12-25", "kind": "closed", "intervals": [], "note": "Christmas Day" },
  { "id": "9b1d7e10-…", "date": "2026-12-31", "kind": "special", "intervals": [["09:00", "13:00"], ["20:00", "02:00"]], "note": null }
]
```

- `date` is a Nairobi calendar date, `YYYY-MM-DD`. There is at most one exception per date (`date_taken`).
- `kind` is `closed` (closed all day, `intervals` is always `[]`) or `special` (open only inside `intervals`).
- `intervals` are `["HH:MM", "HH:MM"]` pairs, 24-hour, 1 to 3 of them for a `special` day, sorted by start and not
  overlapping or touching. An interval whose end is not after its start runs past midnight: `["20:00", "02:00"]` is
  open from 20:00 until 02:00 the next day, and `["09:00", "09:00"]` is 24 hours. The part after midnight belongs to the
  next date. A `closed` exception on that next date cuts it at midnight; a `special` one takes over at its first
  interval's start. An overnight interval fills the rest of its own date, so no other interval on that date may start
  later.
- `note` is optional plain text, at most 120 characters, no control characters, trimmed (blank becomes `null`).
  Customers see it next to the hours for that date. Clients must render it as text, never as HTML.
- The list is kept oldest first, sorted by date.

### Limits and the date window

- At most **60 upcoming** exceptions per business (`limit_reached:exceptions`). Editing an existing one at the limit
  still works.
- A date may be today (Nairobi) or up to **730 days** ahead. Past dates are refused (`date_in_past`), as are dates beyond
  the window (`date_too_far`).
- Past dates are removed on every write, so the stored list only ever holds today and upcoming dates.
- Customers get today and upcoming only. `public_exceptions()` filters again on read, so an old one that is still stored
  never reaches the customer site.

### Functions (`0007_exceptions.sql`)

All three are `security definer` and run only for `authenticated` and `service_role`, never `anon`.

| Function | What it does |
| --- | --- |
| `seller_save_exception(p_id uuid, p_date date, p_kind text, p_intervals jsonb default '[]', p_note text default null)` | Adds an exception (`p_id` null) or edits one, and returns it. Passing the id of a deleted one puts it back, which is how Undo works. |
| `seller_delete_exception(p_id uuid)` | Removes one. Returns `true` if it existed, `false` if not, so deleting twice is harmless. |
| `exception_normalize(p_date, p_kind, p_intervals, p_note, p_today)` | The validation both functions use. It returns the cleaned exception or raises one of the error codes below. `shared/src/seller/exceptions.js` has the same rules for instant feedback in the seller app, and `supabase/tests/exceptions.test.mjs` checks the two agree. |

Error codes: `invalid_date`, `date_in_past`, `date_too_far`, `invalid_kind`, `invalid_note`, `intervals_required`,
`too_many_intervals`, `invalid_time`, `intervals_overlap`, `date_taken`, `limit_reached:exceptions`, `not_a_seller`,
`account_suspended`. Changes are written to `audit_log` as `exception_added`, `exception_updated` and
`exception_deleted` with the date and kind, never the note text.

### Who can read and write it

| Who | Read | Write |
| --- | --- | --- |
| The seller | Their own list, through the `seller reads own business` policy | Only through the two seller functions. Writing the column directly updates nothing, and `seller_update_profile` refuses an `exceptions` field. Paused and expired sellers can still use them; suspended sellers cannot. |
| Another seller | Nothing | Nothing |
| Admins | All of it, through the `admin all businesses` policy | The same policy |
| Customers (`anon`, and signed-in people browsing) | Not the `businesses` table. Only `public_businesses.exceptions` and `public_flash_sales.business_exceptions`, today and upcoming, with just `id`, `date`, `kind`, `intervals` and `note` | Nothing |

The customer site and the seller Preview both use `isOpenOn`, `closingInfo` and `hoursRowsFor` from
`shared/src/utils.js`, so "open now", "opens at" and the hours table cannot disagree.

## Automatic M-Pesa payments (Paybill)

Everyone pays the same Paybill with an account number and an amount. **Nobody types an M-Pesa code.** The account number is a
short code (the applicant's application reference, then the seller's Seller ID), not the business name: two shops can share a
name, and the Paybill account field is short. Safaricom (Daraja C2B) tells the backend about each payment and the backend records
it. The full list of scenarios and what each person sees is in [`docs/PAYMENTS.md`](../docs/PAYMENTS.md).

Setup, once per environment:

1. Apply migrations `0012` and `0015`.
2. Set the Paybill business number: edit and run `supabase/set-mpesa.sql` in the SQL editor (until then approving fails with `mpesa_not_configured`).
3. Set `MPESA_CALLBACK_SECRET` (see `.env.example`), run `supabase secrets set --env-file supabase/.env`, then deploy `pay-callback`.
4. Register the callback URLs with Safaricom: `node --env-file=scripts/.env scripts/register-mpesa-c2b.mjs`.
   The URLs are `<SUPABASE_URL>/functions/v1/pay-callback/<MPESA_CALLBACK_SECRET>/confirmation` and `/validation`.
   (Safaricom rejects URLs containing "mpesa" or "safaricom", so the function is called `pay-callback`.)

How it works (`mpesa_ingest` and friends, migration `0015`):

- Every callback is stored raw in `mpesa_callbacks` first. Every payment is stored once in `mpesa_transactions` (retries are ignored), whatever its account or amount.
- The account is matched to one application reference, then one Seller ID, then (fallback) one business name. Two shops with the same name are never guessed between: the payer's hashed phone can break the tie, otherwise an admin assigns it with one click.
- Money is credit on the application or business. Whole months are taken from it, the rest waits. So short payments, top-ups, 3-month prepayments and overpayments are one mechanism.
- Renewals for existing sellers apply automatically (`payments` row with `source = 'auto'`). A first payment waits for an admin's **Confirm** (that creates the login). Upgrades and category changes are applied automatically when the seller opened that payment in the portal.
- The admin Payments page reads the `admin_payment_queue` view. Owner and finance can assign, ignore and reprocess (`admin_mpesa_*` functions).
