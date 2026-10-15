# B0d messaging and jobs: function contracts

> **Contracts v1: approved by the owner on 2026-10-15.**
> `docs/ADMIN_SPEC.md` records only the section 5 preamble and has no entries for these four functions, and the owner
> has no more detailed spec for them. These contracts are therefore the specification: they describe what the code does
> (`supabase/functions/*`, `supabase/migrations/0011_messaging.sql`) and the owner approved them as written, with the
> decisions and deviations recorded under [Owner decisions](#owner-decisions-approved-2026-10-15). One point is still
> open; see [Still open](#still-open).

All four functions are `POST` only, answer JSON (except the CSV export), and are deployed with `--no-verify-jwt`
because they check credentials themselves.

## Authentication

| Caller | How | Used by |
| --- | --- | --- |
| Scheduler (`pg_cron`) | header `x-cron-secret: <CRON_SECRET>` (constant-time compare). A wrong or unset secret is `401`. | `dispatch-messages`, `daily-lifecycle` |
| Admin | `Authorization: Bearer <admin JWT>`, then an `admins` row, then a role check. No token or bad token `401`, not an admin or wrong role `403`, database trouble `500`. | all four |

The owner passes every role check. Errors are `{ "error": "<code>" }` and never contain internal text.

## Roles

| Function | Roles (owner always allowed) |
| --- | --- |
| `admin-message` | reviewer, support |
| `dispatch-messages` | support (or cron) |
| `daily-lifecycle` | owner only (or cron) |
| `admin-export` | per dataset: `payments` finance; `businesses` support; `messages` support; `audit` owner only |

## Shared rules

**Channels**: `sms`, `email`, `in_app`. SMS and email rows are delivery records (never shown to sellers). An in-app
row becomes visible to the seller only once its status is `sent` or `delivered`.

**Promotional vs transactional**: every message has `transactional` (boolean). `admin-message` defaults to
**promotional** so a forgotten flag cannot wake sellers at night. A template carries its own flag
(`message_templates.transactional`). Billing reminders are transactional.

**Quiet hours**: setting `site_settings.quiet_hours` = `{"start":"21:00","end":"07:00"}`, Nairobi time (UTC+3, no DST),
may wrap midnight. During quiet hours promotional **SMS and email** are not sent: they are rescheduled to the next
moment quiet hours end. Transactional messages and in-app messages are never delayed. A missing or malformed
setting means no quiet hours (nothing is held back).

**Retries**: a message gets **3 attempts** in total. After attempt 1 it is retried 5 minutes later, after attempt 2
15 minutes later. After the third failure it becomes `failed` and exactly one `admin_notifications` row
(`kind = 'message_failed'`, with message id, channel, attempts and error) is created. A claimed row is leased for
300 seconds (its `scheduled_at` is pushed forward) so overlapping runs never send the same row twice; a crashed run's
lease simply expires.

**Dev mode**: when the messaging mode is `mock` (default whenever `APP_ENV` is not `production`, or `MESSAGING_MODE=mock`)
`dispatch-messages` sends nothing and marks SMS/email rows `sent` with `provider_id = 'dev'`. In `live` mode (the
default in production) it calls Africa's Talking (SMS) and Resend (email); a missing provider secret is a failed
attempt (`sms_not_configured` / `email_not_configured`), never a fake success.
In-app rows are always recorded `delivered` with `provider_id = 'in_app'` (no provider involved).

**Audit**: every action writes `audit_log` before answering, and if the audit write fails the request fails (`500`).
The one exception is a cron run of `dispatch-messages`, which writes no row (see the table below and D2b).

| Function | `action` | `target_type` |
| --- | --- | --- |
| `admin-message` | `message.queue` | `message_batch` |
| `dispatch-messages` | `dispatch.run`, **only when an admin runs it by hand**; `after` holds `limit`, `dev` and the counts `claimed`, `sent`, `retried`, `failed`, `skipped`. Cron runs write nothing. | `system` |
| `daily-lifecycle` | `lifecycle.daily` (`actor_role` is `system` for cron) | `system` |
| `admin-export` | `export.run` | the dataset name |

**Rate limits**: admin callers only, one bucket per admin and action through `hit_rate_limit` (key
`admin:<action>:<user id>`, fixed window). Over the limit is `429 { "error": "rate_limited", "retryAfter": <window seconds> }`
and no work is done. The check runs after authentication and the role check, so callers who fail either do not spend
it. A scheduler call (`x-cron-secret`) is never limited and never touches the limiter. If the limiter itself fails the
request fails (`500`); it is never let through.

| Function | Bucket `<action>` | Limit |
| --- | --- | --- |
| `admin-message` | `message` | 30 per minute |
| `admin-export` | `export` | 10 per minute |
| `dispatch-messages` | `dispatch` | 10 per minute |
| `daily-lifecycle` | `lifecycle` | 5 per hour |

## `admin-message`

Queues messages; it never sends. Rows land in `messages` as `queued` (in-app, when not scheduled for later, is written
`delivered` straight away).

Request:

```json
{
  "target": { "businessIds": ["<uuid>", "..."] },
  "channels": { "sms": true, "email": false, "inApp": true },
  "templateKey": "renewal.sms",
  "subject": "optional, max 150",
  "body": "optional, max 4000 (one of templateKey or body is required)",
  "lang": "en",
  "variables": { "message": "any {{placeholder}}" },
  "scheduledAt": "2026-10-20T06:00:00Z",
  "transactional": false,
  "preview": false,
  "idempotencyKey": "abc-12345678"
}
```

- `target` is exactly one of `businessIds` (1 to 500 UUIDs), `segment`, or `applicationId` (one applicant: SMS and email only).
- Segments: `all_live`, `expiring_7d`, `in_grace`, `expired`, `category:<id>`, `town:<name>`. Unknown segment `422 unknown_segment`; more than 500 recipients `422 too_many_recipients`.
- `lang` is `en` or `sw` (falls back to English when a template has no Swahili text).
- Placeholders are `{{name}}`. Built in: `business_name`, `seller_id`, `paid_until`; extra ones come from `variables`. A placeholder without a value is `422 missing_variables` (never sent blank).
- A template with a channel can only be used on that channel (`422 template_channel_mismatch`). `transactional` defaults to the template's flag, otherwise `false`.
- SMS body over 612 characters is `422 sms_too_long`. A recipient with no phone/email is skipped for that channel and counted in `skipped`.
- `idempotencyKey` (8 to 80 of `A-Za-z0-9-`): the same key never queues the same message to the same recipient and channel twice; a repeat answers `{ "ok": true, "queued": 0, "duplicate": true }`.
- `preview: true` writes nothing and returns counts and up to three rendered samples.

Response `200`:

```json
{ "ok": true, "queued": 3, "rows": { "sms": 2, "email": 0, "inApp": 1 },
  "skipped": { "sms": 0, "email": 0, "inApp": 0 }, "notFound": 0,
  "transactional": false, "scheduledAt": "2026-10-15T06:30:00.000Z" }
```

Other errors: `422 bad_request` (with `issues`), `422 unknown_template`, `422 no_recipients`, `422 nothing_to_send`, `404 application_not_found`.

## `dispatch-messages`

Request body (optional): `{ "limit": 50 }` (1 to 200). Claims due messages (`claim_due_messages`), sends them (or dev-marks them),
and records each outcome (`record_message_result`: sent, retry, or failed per the retry rules above).
Transactional rows are claimed first.

Response `200`: `{ "ok": true, "dev": true, "claimed": 4, "sent": 3, "retried": 1, "failed": 0, "skipped": 0 }`.

A hand-run (admin) call is rate limited (10 a minute) and writes one `dispatch.run` audit row after the messages are
processed; if that write fails the answer is `500` even though the messages were already handled. A cron call is
neither limited nor audited.

## `daily-lifecycle`

No body. Calls `queue_billing_notices(now)`, which creates the in-app notices (existing `generate_billing_notices`) plus an
SMS and, when the business has an email, an email copy of each, all **transactional**.

| When (Nairobi calendar days from `paid_until`) | Notice | `dedupe_key` (copies append `:sms` / `:email`) |
| --- | --- | --- |
| 7, 3 and 1 days before | `reminder` | `reminder:<days>:<paid_until day>` |
| the day after (1 day of grace) | `grace` | `grace:<paid_until day>` |
| 2 to 4 days after | `expiry` | `expiry:<paid_until day>` |

`dedupe_key` is unique per `(business_id, dedupe_key)`, so running the job any number of times creates each notice once.
The key includes the `paid_until` day, so a renewal (new `paid_until`) starts a fresh set. Businesses that lapsed long
ago are not texted when the job first runs.

Response `200`: `{ "ok": true, "inApp": 2, "queued": 3 }`.

## `admin-export`

Request: `{ "dataset": "payments" | "businesses" | "messages" | "audit", "format": "csv" | "json", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }`
(`format` defaults to `csv`; `from`/`to` are inclusive Nairobi days; `from` after `to` is `422`).

- Columns are a fixed allow-list per dataset (see `DATASETS` in `admin-export/handler.ts`); nothing is exported with `select *`.
  Message bodies, recipient addresses and applicant ID documents are never exported.
- At most 10,000 rows (newest first); `truncated` says whether more existed.
- CSV is UTF-8 with a BOM and CRLF line ends. Text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'` so spreadsheets do not run them as formulas; real numbers are left alone.
- CSV answer: `200 text/csv`, `Content-Disposition: attachment; filename="epicmkt-<dataset>-<YYYYMMDD>.csv"`, headers `X-Export-Rows` and `X-Export-Truncated`, `Cache-Control: no-store`.
- JSON answer: `{ "ok": true, "dataset": "payments", "count": 12, "truncated": false, "rows": [ ... ] }`.

## Schedule

Defined in `supabase/cron/schedule.sql` (not a migration; run once per environment, setup steps in its header).

| Job | Cron (UTC) | Nairobi |
| --- | --- | --- |
| `dispatch-messages` | `* * * * *` | every minute |
| `daily-lifecycle` | `0 4 * * *` | 07:00 daily (when quiet hours end) |

## Owner decisions (approved 2026-10-15)

| # | Decision | Status |
| --- | --- | --- |
| D1 | Rate limits for the four functions (the spec gives none): `admin-message` 30/min, `admin-export` 10/min, `dispatch-messages` 10/min, `daily-lifecycle` 5/hour. Admin callers only; cron is never limited. | approved by the owner on 2026-10-15 |
| D2a | `dispatch-messages` and `daily-lifecycle` accept `x-cron-secret` instead of a user JWT, because `pg_cron` has no JWT. | approved by the owner on 2026-10-15 |
| D2b | `dispatch-messages` writes an audit row (`dispatch.run`, with counts) only when an admin triggers a run by hand. Cron runs stay unaudited because they fire every minute, and failures already raise `admin_notifications`. | approved by the owner on 2026-10-15 |
| D3a | Sellers see only delivered in-app messages; queued or scheduled in-app rows and all SMS/email delivery records stay hidden. | approved by the owner on 2026-10-15 |
| D3b | Expiry texts go out only 2 to 4 days after `paid_until`, so long-lapsed businesses are not texted on first run. | approved by the owner on 2026-10-15 |
| D3c | In production a missing SMS or email provider key counts as a failed attempt, never a fake success. | approved by the owner on 2026-10-15 |
| D4 | The four function contracts in this document (request and response shapes, roles, export columns, cron times) are approved as v1. The owner has no more detailed spec for these functions. | approved by the owner on 2026-10-15 |

### Deviations from the section 5 preamble

`docs/ADMIN_SPEC.md` says every function verifies the caller JWT, rate-limits with `hit_rate_limit`, writes `audit_log`,
and returns `400` for validation errors. These are the approved differences.

| Preamble says | These functions | Status |
| --- | --- | --- |
| Verify the caller JWT | `dispatch-messages` and `daily-lifecycle` also accept `x-cron-secret` (a wrong or unset secret is `401`); `admin-message` and `admin-export` accept a JWT only | approved by the owner on 2026-10-15 (D2a) |
| Write `audit_log` | `dispatch-messages` audits hand-run dispatches only; the other three audit every call | approved by the owner on 2026-10-15 (D2b) |
| Rate-limit with `hit_rate_limit` | Admin callers only, with the limits above; cron is never limited | approved by the owner on 2026-10-15 (D1) |

## Still open

- **Validation status code.** The preamble says validation errors return `400`. `admin-message` and `admin-export`
  return `422 bad_request` (with `issues`) for a malformed body, and so do the other input errors listed above
  (`unknown_template`, `no_recipients`, and so on), while `dispatch-messages` returns `400 bad_request`. This
  document describes the current behavior, assumed, needs owner sign-off: either accept `422` for these functions and
  record it as a deviation, or change `admin-message` and `admin-export` to `400`.

## Not covered

- No delivery-status webhooks: Africa's Talking and Resend acceptance is recorded as `sent`; nothing moves a row to `delivered` later.
