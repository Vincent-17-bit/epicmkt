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

Returns an amount warning (amount differs from plan price) that must be acknowledged. A duplicate M-Pesa code is not a warning: it is a hard block.

On confirm for an application's first payment it runs ACTIVATION:

1. Generate a unique slug from the business name (permanent, suffix `-2`, `-3` on clashes).
2. `seller_id` = `generateSellerId()`: `ES` + 6 digits, the first non-zero.
3. A 12-character random temporary password.
4. Create the Supabase auth user through the admin API with email `<seller_id lowercase>@sellers.epicmkt.app` and `user_metadata.must_change_password = true`.
5. Insert the business from the application. Public profile fields only: ID number, KRA PIN, SBP number, registration number and document references stay on the application, linked by `application_id`.
6. Set `first_paid_at`, and `paid_until` = `addCalendarMonth(today in EAT)`, stored as Nairobi midnight.
7. Set the application to `activated`.
8. Write a confirmed payment with a sequential receipt number (`RCT-000001`).
9. Send the seller ID and temporary password by SMS and email. The password is returned ONCE to the admin screen and never stored in plain text.
10. Queue the welcome message.

Renewals: `paid_until` = `addCalendarMonth(max(today, current paid_until))`, so early renewal loses no days. A short "payment received, paid until <date>" message is queued by SMS, email and in-app, idempotent through `dedupe_key`.

A duplicate M-Pesa code is a hard block (409 `duplicate_mpesa_code`), not an acknowledgeable warning; amount mismatch stays acknowledgeable. The unique index on `payments.mpesa_code` (rejected payments excluded) enforces it, and nothing is created.

### admin-reset-seller-password

`{ businessId, reason }`: new temporary password, `must_change_password = true`, sent by SMS and email, audited. The reason is required.

## 7C. Businesses

Table fed by server-side pagination and filters: tabs All, Live, Expiring soon, In grace, Expired, Paused, Suspended, Unlisted, Flagged, Deleted (recycle bin); filters: category, county/town, plan, verified, featured, status, days-left range, has open flags, has unconfirmed payment, agent, created date; sort by name, paid_until (soonest first), created, last edit, last login, strikes, items count, health score; search by name, phone, seller ID, slug, owner. Columns: logo and name, category, town, owner and phone, status chip, plan, verified, featured, paid_until with compact countdown, items, flags, health ring, last login. Column chooser, saved views, bulk select and bulk actions (suspend, unsuspend, unlist, feature, extend days, message, tag, assign agent, export CSV).

Status rules: Live = light-blue chip + fa-circle-check; Expiring soon = tint chip + fa-bell; Grace = tint chip + fa-clock; Expired / Suspended = black chip with white text + fa-ban; Flagged = danger chip + fa-flag. Status never relies on colour alone. A business is visible to customers only if status = live AND not deleted AND today (EAT) <= paid_until + grace_days (1). Health score = profile completeness, price freshness, recent login, open reports. Dangerous bulk actions (suspend, unlist, extend days) need a reason and typed confirmation. All times display in Africa/Nairobi.

## 7G. Plans, categories, templates (ASSUMED: reconstructed from the B6a/B6b step prompts and the existing schema; confirm or correct)

Status: only the plans paragraph is written so far. Categories, template builder and document rules follow with B6b.

### Plans and pricing

- One `plans` row per category and plan (`standard`, `premium`). Editable fields: `price_kes` (whole KES, 0 to 100000), `items_limit` (whole number, 0 or more), `top_benefits` (exactly 3 lines, each 1 to 80 characters), `badge` (none, `Best value` or `Popular`), `trial_days` (0 to 90, default 0).
- Cross-checks per category: Premium price must not be lower than Standard, and Premium `items_limit` must not be lower than Standard. A price of 0 is allowed and shows as "Free".
- Global limits (`global_limits`, one row): per plan `photosPerItem`, `videosPerItem`, `galleryPhotos`, `faqs`, `flashSalesPerMonth`, `flashSalesConcurrent` (whole numbers, 1 or more) and `activeOffers` (whole number or null for unlimited). Premium must not be lower than Standard on any limit.
- Every save of a plan or of the global limits writes an immutable `plan_versions` snapshot (who, when, optional reason). The editor always asks for a reason; the server insists on one whenever the price changes. Any version can be restored: restoring creates a new version.
- "Who is affected" note, shown before saving: a new price applies to applications submitted after the save and to renewals from the next billing date; a business keeps the price of its current paid period and an application keeps `price_at_submission`. Lowering `items_limit` never deletes items: businesses above the new limit keep what they have and cannot add more. The note shows live counts (live businesses on that plan, applications still in progress).
- Coupons: `code` (A to Z, 0 to 9, hyphen; 3 to 24 characters), `kind` (`percent` 1 to 100, or `fixed` KES), optional category and plan scope, optional validity dates, optional redemption cap, active flag. Redemption at payment time is built with the payments step; this step stores and manages them.
- Roles: owner and finance can edit plans and coupons; other roles read only.
- The Become a Seller page reads categories, plans and global limits from the API on every visit. No code change or deploy is needed after an edit. Two public pages read them: the registration form's package cards and comparison table (`/become-a-seller`), and the marketing page (`/sell`), which shows the plan table for one chosen category, and "Plans start at" uses the lowest Standard price across active categories.
