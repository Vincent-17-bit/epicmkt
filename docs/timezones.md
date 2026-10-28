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

Migration `0048_utc_timezone.sql` sets the database zone to UTC and pins the two functions that read the session zone (`admin_analytics`, `log_search`), because PostgREST lets a client send `Prefer: timezone=...`. Every other conversion from an instant to a day names `'Africa/Nairobi'` explicitly.

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

## Shop time and the viewer's time (`shared/src/shopTime.js`)

A shop's opening hours, exceptions and closing times are wall-clock times in **the shop's own zone** (`businesses.timezone`, an IANA name, default `Africa/Nairobi`). Open or closed is always computed in that zone, so it is the same for every viewer. Only the wording changes:

- The shop's time is always labelled: `6:00 PM EAT`, `10:00 PM GMT+5:30`. (The GMT form is used where an abbreviation would be ambiguous: IST is India, Ireland and Israel.)
- A browser also passes `getUserTimeZone()` as the **viewer zone**, and when the viewer's clock reads differently the viewer's time follows: `6:00 PM EAT · 7:00 PM your time`, with the weekday when the viewer's day is not the shop's day.
- The viewer zone is **opt in**. Server code (the `statusLine` strings built in the API) passes none and prints shop time with its label, which is right for everyone.
- A shop time is turned into a real instant on its own date (`zonedTimeToUtc`) and the viewer's reading is taken at that instant, so each side's daylight saving on that date is used.
- Exceptions stay attached to the shop's calendar date; `describeExceptionForViewer` converts the wording. An all-day closure becomes the span of the viewer's clock it covers.
- Flash sale and offer times are instants and are shown in the viewer's zone with its label (`formatEndsAt`).

Sellers set the zone on the Account page (`seller_set_timezone`). The column is validated against the database's zone list. `hours_open_in(hours, exceptions, at, tz)` is the SQL twin of `isOpenOn`; `search_businesses` ("open now" and `is_open`) uses it with each shop's zone, and `public_businesses`, `public_flash_sales`, `browse_snapshot` and `products_snapshot` carry the zone next to the hours.

## Not built yet

The admin console cannot change a shop's zone (only the seller can). Hours are still typed and stored as plain wall-clock times; moving a shop to another zone moves its hours with it.
