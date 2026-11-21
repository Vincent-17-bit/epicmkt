# Trending searches

What shoppers search for, shown in the menu and the empty search panel. Migration `0146_trending_v2.sql`.

## What shoppers see

* **One ranking for every kind of search.** A store name, a product, an item on a running flash sale and a category are ranked
  together by how many different people searched for them. Each row says what it is (Store, Product, Flash sale, Category).
  Tapping a store opens its page; anything else opens the search for that word.
* **Two views.** *Popular this week* (the last 7 days) and *Rising now* (the last 24 hours against the word's own daily average of
  the 7 days before). With nothing rising there is only the caption "Popular this week".
* **Their county.** A shopper who chose a town sees their county's list when it has enough searches of its own, otherwise the national
  list (and the panel says so).
* **Never dead words.** A word shows only if something live matches it right now: a visible store, a category, an item on a running
  flash sale, or a visible, available item (the same rules as the search page). Sold-out and hidden things drop out on the next rebuild.
* **Never empty.** On a young site with nothing searched enough yet, the busiest categories stand in.

## How it is built

```
shopper searches ──> log_search(term, county)  ──> search_events        (raw, kept 2 days, anonymous daily hash)
                                                        │  every hour (job `trending`, at :12)
                                                        ▼
                                       search_term_daily   (permanent: day × word × everywhere-or-county → people)
                                                        │
                                  refresh_trending()  ──┴──> search_trending  (the stored lists, nationally and per county)
                                                        │
      /api/products?op=trending[&county=Kisumu] ──> trending_lists(county, limit) ──> JSON (popular, rising, items)
```

* A **person** is a salted hash of the network address that changes every day (migration 0039), so a weekly count is *person-days* and a
  heavy searcher cannot be followed across days. This is deliberate. The county is stored next to that hash, only when the shopper chose
  a town themselves, and is never joined to anything that identifies them.
* **Grouping.** Plural endings are merged by `search_query_tokens` (the same rule search uses), so "gas cylinder" and "gas cylinders" are
  one word. `search_synonyms` merges other spellings and Swahili or Sheng words ("gesi" → "gas"). The shown spelling is the most common one.
* **The bar.** A word needs `trending_settings.min_people` different people (3), growing with traffic to `min_people_pct` (0.5 %) of the
  last 48 hours' searchers, capped at `min_people_cap` (50). *Rising* also needs `rising_min_ratio` (1.5×).
* **Hiding.** A word containing anything in `search_blocklist` is never shown. **Pinning** puts a word at the top of *Popular* for 1 to 30
  days (3 at a time); it still has to be live.
* **If it breaks.** A list older than `stale_hours` (3) is not served: shoppers get the live count of the last 24 hours (migration 0039),
  and if that is empty too, the busiest categories. `/api/products` falls back the same way (`trending_lists` → `top_searches_hourly` →
  `top_searches`), so deploying the site before the migration does not break the menu.

## Running it

* **Schedule:** `supabase/cron/schedule.sql` (job `trending`, `12 * * * *`). Runs after `search-rollups` because it reads the dictionary.
  The edge cache holds the list until 20 minutes past the next hour.
* **Check:** `select public.trending_status();` returns `{ ok, computedAt, ageMinutes, staleAfterHours }`. `ok: false` means the job has not
  run in `stale_hours`. The admin **Catalogue → Trending** page shows this as a red alert, and `supabase/cron/verify.sql` (5b) prints it.
* **Admin → Catalogue → Trending:** the lists, **Pin**, **Hide**, hidden words and synonyms (reviewers and support admins).
* **Settings:** one row in `trending_settings`; change it in SQL and it applies at the next rebuild.
* **Run it now:** `select public.refresh_trending();`
* **Switch it off:** `select cron.unschedule('trending');`. The menu then falls back to the live count and nothing else breaks.
* **Retention:** `search_term_daily` keeps `keep_days` (120) days.

## Limits

* The word grouping is by search words, not meaning: "tomato" and "tomatoes" may count separately until a synonym joins them.
* Shared mobile networks put many shoppers behind one address, so busy places can be under-counted.
* County lists need `county_min_terms` (5) words of their own; smaller counties see the national list.
