# Admin sign-in and roles

## Sign-in

1. Email and password (Supabase Auth).
2. The account must have a row in `public.admins`. Anyone else is signed straight back out.
3. A 6-digit code from an authenticator app (TOTP). The first time, the admin scans a QR code to set one up; after that a code is asked for on every sign-in. Nothing under `/admin` shows until this is done.
4. After 15 minutes without activity (warning at 13) the admin is signed out. The Account page lists the places a person is signed in and can sign out all other devices (`admin_my_sessions()`, migration 0022).

Supabase setting needed once: Authentication, Multi-Factor, TOTP enrol and verify must be on (it is by default on new projects). If it is off, the setup screen says so.

### An admin lost their phone

The owner removes the old authenticator, and the admin sets up a new one at their next sign-in:

```sql
delete from auth.mfa_factors where user_id = '<the admin user id>';
```

(or Authentication, Users, the user, Remove MFA factor, in the Supabase dashboard).

## Roles

`public.admins.role` is one of `owner`, `reviewer`, `finance`, `support`. The owner can do everything.
The database and the edge functions enforce the rules (`has_role()` and `requireAdmin()`); the screens in
`admin/src/auth/permissions.js` mirror them so a person is never shown a button that will be refused.

| Action | Roles besides owner |
|---|---|
| Open and decide applications, view documents | reviewer |
| See businesses | reviewer, finance, support |
| Hide or show a business, bulk actions (suspend, tag, feature, message, export) | reviewer, support |
| Extend subscriptions in bulk | finance |
| See payments | reviewer, finance, support |
| Confirm, reject, assign payments, handle M-Pesa callbacks | finance |
| Seller messages (read, send) | reviewer, support |
| Flash sales (view, end) | reviewer, support |
| Live activity feed on the Command Center | reviewer |
| Settings, categories, plans, content, admin accounts | owner only |

`admin/src/auth/permissions.test.js` pins these rules. If a migration changes who may call a function, change the table and the test together.
