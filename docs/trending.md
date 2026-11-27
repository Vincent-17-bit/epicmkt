# Trending searches

What shoppers search for, shown in the menu and the empty search panel. Migration `0146_trending_v2.sql`.

## What shoppers see

* **One ranking for every kind of search.** A store name, a product, an item on a running flash sale and a category are ranked
  together by how many different people searched for them. Each row says what it is (Store, Product, Flash sale, Category).
  Tapping a store opens its page; anything else opens the search for that word.
* **Two views.** *Popular* and *Rising now* (the last 24 hours against the word's own daily average of the 7 days before). Popular
  looks at the last 7 days. On a quiet week, when fewer than `popular_target` (10) words qualify, it widens to 14 and then 30 days,
  only as far as it takes, so the list is not left short. A busy week stays on 7 days. The window in use is returned as `windowDays`
  (7, 14 or 30; 1 for the live count; none for the category stand-in).
* **The day's leader.** Every hour the searches of the last 24 hours are summed per word (one per person per hour, spellings merged). The
  word with the most, among words at least `min_people` different people searched, always leads *Rising* and carries "Fastest rising",
  even an everyday word. It changes as the numbers change. Other words rise only when they beat their own 7-day average by
  `rising_min_ratio`. When the hourly list is stale, the live top word still leads Rising. Migration `0160`.
* **Global.** One list for everyone, wherever they are. Nothing is split by county or town.
* **Never dead words.** A word shows only if something live matches it right now: a visible store, a category, an item on a running
  flash sale, or a visible, available item (the same rules as the search page). Sold-out and hidden things drop out on the next rebuild.
* **Never empty.** On a young site with nothing searched enough yet, the categories with the most live shops stand in (a real count, in that order).

## How it is built

```
shopper searches ──> log_search(term)  ──> search_events        (raw, kept 2 days, anonymous daily hash)
                                                        │  every hour (job `trending`, at :02)
                                                        ▼
                                       search_term_daily   (permanent: day × word × word → people)
                                                        │
                                  refresh_trending()  ──┴──> search_trending  (the stored lists, the same for everyone)
                                                        │
      /api/products?op=trending ──> trending_lists(limit) ──> JSON (popular, rising, items)
```

* A **person** is a salted hash of the network address that changes every day (migration 0039), so a weekly count is *person-days* and a
  heavy searcher cannot be followed across days. This is deliberate. No location is stored with a search.
* **Grouping.** Plural endings are merged by `search_query_tokens` (the same rule search uses), so "gas cylinder" and "gas cylinders" are
  one word. `search_synonyms` merges other spellings and Swahili or Sheng words ("gesi" → "gas"). The shown spelling is the most common one.
* **The bar.** A word needs `trending_settings.min_people` different people (3), growing with traffic to `min_people_pct` (0.5 %) of the
  last 48 hours' searchers, capped at `min_people_cap` (50). *Rising* also needs `rising_min_ratio` (1.5×).
* **No hand-placed ranking.** The order comes only from how many different people searched, with recent days counting more: a person
  searching `n` days ago counts `0.5^(n / popular_half_life)` (half-life 7 days; 0 turns the fade off). An old spike therefore fades
  smoothly instead of dropping out at a cutoff, and does not outrank a word people are searching now. Ties: more people in the last
  24 hours, then name. Nobody can pin a word to the top; pinning was removed in migration `0153_trending_no_pins.sql`.
* **Hiding.** A word containing anything in `search_blocklist` is never shown. This is moderation: it removes a word, it does not move any other.
* **If it breaks.** A list older than `stale_hours` (3) is not served: shoppers get the live count of the last 24 hours (migration 0039),
  and if that is empty too, the busiest categories. `/api/products` falls back the same way (`trending_lists` → `top_searches_hourly` →
  `top_searches`), so deploying the site before the migration does not break the menu.

## Running it

* **Schedule:** `supabase/cron/schedule.sql` (job `trending`, `2 * * * *`). Runs after `search-rollups` (at :57) because it reads the dictionary.
  The edge cache holds the list until 5 minutes past the next hour.
* **Check:** `select public.trending_status();` returns `{ ok, computedAt, ageMinutes, staleAfterHours }`. `ok: false` means the job has not
  run in `stale_hours`. The admin **Catalogue → Trending** page shows this as a red alert, and `supabase/cron/verify.sql` (5b) prints it.
* **Admin → Catalogue → Trending:** the lists (read-only ranking), **Hide**, hidden words and synonyms (reviewers and support admins).
* **Settings:** one row in `trending_settings`; change it in SQL and it applies at the next rebuild. Window: `popular_days` (7),
  `popular_mid_days` (14), `popular_max_days` (30), `popular_target` (10), `popular_half_life` (7). Migration `0157`.
* **Run it now:** `select public.refresh_trending();`
* **Switch it off:** `select cron.unschedule('trending');`. The menu then falls back to the live count and nothing else breaks.
* **Retention:** `search_term_daily` keeps `keep_days` (120) days.

## Hidden shops (migration 0147)

A shop that is suspended, deleted, unlisted, not yet approved, or whose subscription ended with no grace left (`business_is_visible`) is
never shown. The stored lists are rebuilt hourly, so `trending_lists` re-checks every store, product and flash row against the shop and
item **as they are at read time**: a shop that lapses disappears from Popular and Rising at once, not at the next rebuild. The same
re-check protects the type-ahead products and stores (`search_suggest`) and the older hourly list. Only the plain completion words of
the type-ahead and the cached endpoint response (about an hour) can lag.

## Limits

* The word grouping is by search words, not meaning: "tomato" and "tomatoes" may count separately until a synonym joins them.
* Shared mobile networks put many shoppers behind one address, so busy places can be under-counted.
