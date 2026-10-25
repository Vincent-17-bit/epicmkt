# Time zones

One rule: **the database and the API speak UTC; the browser converts to the viewer's zone when it draws a value.**

## The three kinds of time

| Kind | Example | Stored as | Shown |
|---|---|---|---|
| **Instant** | message sent, payment confirmed, flash sale start/end, audit stamp, offer end | `timestamptz` (UTC) | In the **viewer's** zone |
| **Business day** | the day a listing is paid until, a shop's opening hours, an exception date, quiet hours | `timestamptz` at Nairobi midnight, or a `date` | In **Africa/Nairobi**, for everybody |
| **Calendar date** | `sbp_expiry`, `period_end`, an analytics day bucket | `date` | As written. No zone is ever applied |

Why the middle row is different: "paid until 25 Oct" means the *Nairobi* day. Converting it for a viewer in New York would show 24 Oct, which is wrong for the seller and the shopper alike. Business days are anchored on purpose.

## Wire format

Every instant leaves the API as ISO 8601 in UTC, for example `2026-10-25T04:51:00.000Z`. Postgres serialises `timestamptz` as `2026-10-25T04:51:00+00:00`, which is the same instant. Both parse. A timestamp **without** an offset (`2026-10-25T04:51:00`) is rejected on purpose: the browser would read it in the device zone, so it would mean a different moment for every user.

Migration `0045_utc_timezone.sql` sets the database zone to UTC and pins the two functions that read the session zone (`admin_analytics`, `log_search`), because PostgREST lets a client send `Prefer: timezone=...`. Every other conversion from an instant to a day names `'Africa/Nairobi'` explicitly.

## Using it (`@epicmkt/shared`, file `shared/src/time.js`)

```js
import { formatDateTime, formatBusinessDay, formatCalendarDay, localInputToUtcIso, utcToLocalInput, getUserTimeZone } from "@epicmkt/shared";

formatDateTime(message.createdAt);          // "25 Oct, 7:51 pm", in the viewer's zone
formatBusinessDay(business.paidUntil);       // "25 Oct 2026", the same for everyone
formatCalendarDay(app.sbpExpiry);            // a date column, never shifted

// <input type="datetime-local">: the value means "this wall clock in the viewer's zone"
const iso = localInputToUtcIso(inputValue, getUserTimeZone());   // send this to the API
const value = utcToLocalInput(sale.startsAt, getUserTimeZone()); // put this back in the input
```

Business logic that needs "now at the shop" uses `nairobiNow(date, timeZone?)`, `isOpenOn(...)`, `statusOf(...)`. They read the wall clock in the business zone by default and accept any IANA zone as a trailing argument.

## Daylight saving

Zones are IANA names (`America/New_York`), never fixed offsets, so the rules come from the runtime's tz database.

- **Spring forward**: a local time that does not exist (New York 2026-03-08 02:30) moves forward by the gap, to 03:30 EDT. Options: `{ gap: "backward" }` or `{ gap: "throw" }`.
- **Fall back**: a local time that happens twice (New York 2026-11-01 01:30) takes the first one. Options: `{ overlap: "later" }` or `{ overlap: "throw" }`.
- **Days are not always 24 hours.** Use `dayRangeUtcIso(day, zone)` for "everything on this day" and `addCalendarDays` for day arithmetic; never add 86 400 000 ms to move a day.
- Handled and tested: 30 minute DST (Lord Howe), +12:45 (Chatham), +5:45 (Kathmandu), negative DST (Casablanca), 2 hour DST (Troll), DST that starts at midnight (Havana), a zone that skipped a whole day (Apia, 30 Dec 2011).

## Do not

- `getHours()`, `getDate()`, `getDay()`, `getTimezoneOffset()`: they answer in the **device** zone. Use `zonedParts(value, zone)`.
- `new Date("2026-10-25T04:00:00")`: read in the device zone. Use `parseInstant`.
- `new Date("2026-10-25")` for a calendar day: it is UTC midnight and drifts a day in the Americas. Use `formatCalendarDay`.
- `+ 3 * 3600000` or `"+03:00"`: wrong the moment the zone changes, and it hides the intent. Use `BUSINESS_TIME_ZONE` and the helpers.
- `now + 24 hours` to mean "tomorrow".

`shared/src/time.guard.test.js` fails the build if any of these appear in production source (client, seller, admin, ui, shared, backend and the edge functions).

## Server side

The edge functions get the same module: `npm run sync:shared` copies `shared/src/time.js` to `supabase/functions/_shared/synced/time.js` (`--check` runs in CI), and `_shared/dates.ts` builds on it. SMS and notification text composed on the server contains **business days** ("paid until 25 Oct 2026"), which are the same for every recipient by design.

## Testing

| Command | What it proves |
|---|---|
| `npm run test:shared` | the time module on 25 zones (property tests), shop hours on DST days, the guard |
| `npm run test:tz` | the unit suites again under 10 different machine time zones |
| `npm run test:db` | UTC storage, session zone independence, analytics under 12 session zones |

## Not built yet

The business zone is fixed to Nairobi. The helpers already take a zone, so a per-business `timezone` column is a schema change, a seller setting and a pass over the SQL that computes "open now" (migration 0042), not a rewrite of the logic.
