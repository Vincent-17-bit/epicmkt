# B0d messaging and jobs: function contracts

> **Derived from the schema and the tests, not from spec section 5, so verify before merge.**
> Spec section 5 was not available in the repository when these functions were written. Everything below describes
> what the code does today (`supabase/functions/*`, `supabase/migrations/0011_messaging.sql`); where the spec says
> something different, the spec wins and the code should change.

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
`dispatch-messages` sends nothing and marks SMS/email rows `sent` with `provider_id = 'dev'`. In `live` mode it calls
Africa's Talking (SMS) and Resend (email); a missing provider secret is a failed attempt, never a fake success.
In-app rows are always recorded `delivered` with `provider_id = 'in_app'` (no provider involved).

**Audit**: every action writes `audit_log` before answering, and if the audit write fails the request fails.

| Function | `action` | `target_type` |
| --- | --- | --- |
| `admin-message` | `message.queue` | `message_batch` |
| `daily-lifecycle` | `lifecycle.daily` (`actor_role` is `system` for cron) | `system` |
| `admin-export` | `export.run` | the dataset name |

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

## Not covered

- These endpoints are not rate limited (admin and cron callers only). Add `enforceRateLimit` if the spec asks for it.
- No delivery-status webhooks: Africa's Talking and Resend acceptance is recorded as `sent`; nothing moves a row to `delivered` later.
