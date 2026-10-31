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
| Seller messages (read, send, start a conversation, mark resolved or reopen: `admin_set_conversation_resolved()`, migration 0067) | reviewer, support |
| Flash sales (view, end) | reviewer, support |
| Live activity feed on the Command Center | reviewer |
| Delete or clear items in the live activity feed (`activity.manage`, `admin_delete_activity()`, migration 0059) | reviewer |
| Settings, categories, plans, content, admin accounts | owner only |

Deleting from the live activity feed never changes the audit log. A notification row is deleted for good; an audit row is only hidden from the feed of the admin who deleted it (`admin_activity_dismissals`, one private list per admin), so the Audit page and every other admin still see it.

`admin/src/auth/permissions.test.js` pins these rules. If a migration changes who may call a function, change the table and the test together.
