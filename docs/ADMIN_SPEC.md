# EpicMKT Admin: spec

Only section 5 is recorded here.

## 5. Edge functions: decisions and payments

Every function verifies the caller JWT with `auth.getUser`, loads the `admins` row, checks the role, rate-limits with `hit_rate_limit`, validates input with zod, writes `audit_log`, and returns JSON with `Cache-Control: no-store`. All time logic uses Africa/Nairobi (UTC+3); store UTC. One month is a calendar month. Grace is 1 day.

Validation errors return 400, a missing role 403, a rate limit 429.

| Function | Roles | Limit |
| --- | --- | --- |
| `admin-decide-application` | owner, reviewer | 60 per minute |
| `admin-confirm-payment` | owner, finance | 30 per minute |
| `admin-reset-seller-password` | owner | 5 per hour |

### admin-decide-application

`{ applicationId, action: 'request_changes'|'approve'|'reject'|'set_verification'|'return_to_queue', reason?, note?, channels: { sms, email, inApp }, verificationLevel?, priceOverride?, preview? }`

- `preview: true` returns the rendered messages per channel and sends or queues nothing.
- `request_changes` needs at least one open flag or a note.
- `reject` needs a reason.
- `approve` moves the application to `approved` and queues the payment-instructions messages: M-Pesa Till or Paybill from `site_settings`, amount = `price_at_submission`, or the override with a recorded reason.
- Every action appends `application_events` and queues messages to the phone and email the applicant gave.

### admin-confirm-payment

`{ applicationId?, businessId?, mpesaCode, amount, months, action: 'confirm'|'reject', reason?, acknowledgeWarnings? }`

Returns warnings (duplicate M-Pesa code, amount differs from plan price) that must be acknowledged.

On confirm for an application's first payment it runs ACTIVATION:

1. Generate a unique slug from the business name (permanent, suffix `-2`, `-3` on clashes).
2. `seller_id` = `SLR-` + 6 characters from the safe alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
3. A 12-character random temporary password.
4. Create the Supabase auth user through the admin API with email `<seller_id lowercase>@sellers.epicmkt.app` and `user_metadata.must_change_password = true`.
5. Insert the business from the application. Public profile fields only: ID number, KRA PIN, SBP number, registration number and document references stay on the application, linked by `application_id`.
6. Set `first_paid_at`, and `paid_until` = `addCalendarMonth(today in EAT)`, stored as Nairobi midnight.
7. Set the application to `activated`.
8. Write a confirmed payment with a sequential receipt number (`RCT-000001`).
9. Send the seller ID and temporary password by SMS and email. The password is returned ONCE to the admin screen and never stored in plain text.
10. Queue the welcome message.

Renewals: `paid_until` = `addCalendarMonth(max(today, current paid_until))`, so early renewal loses no days. A short "payment received, paid until <date>" message is queued by SMS, email and in-app, idempotent through `dedupe_key`.

An M-Pesa code cannot be recorded twice: the unique index on `payments.mpesa_code` (rejected payments excluded) turns an acknowledged duplicate into a 409 `duplicate_mpesa_code`, and nothing is created.

### admin-reset-seller-password

`{ businessId, reason }`: new temporary password, `must_change_password = true`, sent by SMS and email, audited. The reason is required.
