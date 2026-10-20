# Admin sign-in and roles

## Sign-in

1. Email and password (Supabase Auth).
2. The account must have a row in `public.admins`. Anyone else is signed straight back out.
3. After 15 minutes without activity (warning at 13) the admin is signed out. The Account page lists the places a person is signed in and can sign out all other devices (`admin_my_sessions()`, migration 0022).

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
