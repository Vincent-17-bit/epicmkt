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
