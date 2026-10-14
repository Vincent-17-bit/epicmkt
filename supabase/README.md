# EpicMKT admin backend setup

## Database pack

Migrations `0001`-`0007` are the app (applications, seller portal, billing). `0008_admin.sql` is the canonical admin migration and
is the final schema for the tables it touches.

```bash
supabase db push
```

`0008` is safe on a database that already holds production data:

- **Lossless.** Nothing is dropped, renamed or narrowed. Columns the seller portal uses (`businesses.user_id`, `payments.amount_kes`,
  `messages.kind`, `items.track_stock`, ...) stay, next to the admin-side ones.
- **Both names stay in step.** Where the seller side and the admin side name the same thing differently, triggers keep the pair equal
  (`user_id`/`owner_user_id`, `amount_kes`/`amount`, `decline_reason`/`reject_reason`, `path`/`storage_path`, `field`/`field_path`,
  `entity`/`target_type`, `hidden_by_admin`+`removed_by_admin`/`admin_status`). Either side can write; the other reads the same value.
- **Convergent and atomic.** It runs as one transaction, can be run any number of times, and a failure changes nothing.
- **Wider wins.** Where the two disagree on a type or a list of allowed values, the wider one is kept so existing rows stay valid
  (`paid_until` stays `timestamptz`, prices stay `numeric(12,2)`, statuses accept both vocabularies).
- **Never rewrites data to fit a constraint.** A constraint that existing rows would violate (slug format, one business per application,
  `admin_status` values) is skipped with a `WARNING` that names it and the number of rows. Fix the data, then add it by hand.

Behaviour changes to know about:

- Policies are role-aware. The blanket "any admin" policies from 0001/0004 are replaced, because policies are OR-ed and the old ones would
  cancel the new ones. Every existing admin row defaults to `owner`, so no current admin loses access. Set `reviewer`, `finance` or
  `support` on `public.admins.role` for everyone else.
- `audit_log` is append-only (no update, delete or truncate, for any role). Tests that need a clean log read rows after a marker instead.
- The anonymous public can read only live, paid-up, non-hidden rows, and only an explicit list of columns (never `user_id`,
  `owner_user_id`, `seller_id`, `monthly_price` or other internal fields).
- A seller sees only `in_app` messages. The same table now holds `sms` and `email` rows with addresses and provider ids.
- A confirmed payment can be refunded, and nothing else.

After applying it, check the output for lines starting `WARNING: 0008: skipped constraint`.

Tests: `npm run test:db` builds a database from `0001`-`0007`, loads production-like data, applies `0008` twice, and asserts that no row or
value is lost (`supabase/tests/admin-upgrade.test.mjs`). The date assertions in the existing tests assume `TZ=UTC`.

## Edge functions

Deploy the admin functions with:

```bash
supabase functions deploy admin-decision --no-verify-jwt
supabase functions deploy admin-confirm-payment --no-verify-jwt
supabase functions deploy admin-reset-seller-password --no-verify-jwt
supabase functions deploy admin-message --no-verify-jwt
supabase functions deploy dispatch-messages --no-verify-jwt
supabase functions deploy daily-lifecycle --no-verify-jwt
supabase functions deploy admin-export --no-verify-jwt
```

## Required env vars

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENV=development
AT_API_KEY=
AT_USERNAME=
AT_SENDER=
RESEND_API_KEY=
MAIL_FROM=
```

## First admin

Create the user in Auth and then set them as the owner:

```sql
update public.admins
set role = 'owner', email = 'you@example.com', display_name = 'Your Name'
where user_id = (select id from auth.users where email = 'you@example.com');
```

## Notes

- All browser writes must go through edge functions and RPCs.
- Admin and audit access are enforced using `public.is_admin()` and `public.has_role()`.
- Realtime is enabled for the admin dashboard tables.
