# EpicMKT admin backend setup

## Database pack

Run the following after the app migrations:

```bash
supabase db push
```

The admin migration is in `supabase/migrations/0008_admin.sql` and is designed to extend the existing seller and application schema without conflicting with the current migration sequence.

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
CRON_SECRET=
```

## Messaging and scheduled jobs

Migration `0009_messaging.sql` adds the delivery columns to `messages`, the templates table, quiet hours and the
SQL the jobs run. Schedule the jobs once per environment with `supabase/cron/schedule.sql`
(`dispatch-messages` every minute, `daily-lifecycle` at 07:00 Nairobi).

- **Dev mode** (`APP_ENV` anything but `production`): `dispatch-messages` sends nothing and marks SMS/email rows
  `sent` with `provider_id = 'dev'`. In production a missing provider key counts as a failed attempt.
- **Quiet hours** (`site_settings.quiet_hours`, default 21:00 to 07:00 Nairobi): promotional SMS/email wait for the
  morning. Transactional messages and in-app messages are never delayed.
- **Retries**: 3 attempts per message (backoff 5 then 15 minutes), then `failed` plus an `admin_notifications` row.
- **Reminders** at 7, 3 and 1 days are keyed by `dedupe_key` (`reminder:<days>:<paid_until day>`), so re-running is safe.
- `admin-message` queues; `dispatch-messages` delivers. `admin-export` returns CSV/JSON and writes an audit row.

Note: `0008_admin.sql` currently fails to apply after `0007` (its tables clash with the ones created in `0004`),
so `0009` does not depend on it.

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
