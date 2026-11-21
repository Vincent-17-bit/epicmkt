# Catalogue scale: listing, search and type-ahead for millions of products

How EpicMKT lists, searches and suggests products so the site stays fast and calm with millions of products and pictures.
Builds on `docs/browse-performance.md` (snapshots, CDN, Redis), which stays true for catalogues that fit in a snapshot.

## What the big marketplaces do

| | Paging | Depth | Sponsored / featured | Type-ahead |
|---|---|---|---|---|
| Amazon | Numbered pages | A keyword search shows about 7 pages (up to 20); categories go deeper | A row of sponsored items at the top, 1-2 mixed into each later row, more mid-page and at the bottom, each labelled "Sponsored" | Lower-case query completions, typed part plain, completion bold |
| Jumia | Numbered pages, ~40 per page | Search and category listings stop at about 2,000 results | Sponsored products, labelled, in the first row of search and category pages, on product pages and the home page | Query and product suggestions |
| eBay | Numbered pages, up to 200 per page | 10,000 results at most ("refine your search") | Promoted listings at the top and mixed into results | Query suggestions |
| Kilimall | App-first, numbered pages on web | Shallow | Promoted items | Query suggestions |

What carries over: **no one lets a shopper page endlessly**; past a few pages they push refining. **Featured items are mixed in at a fixed share (half of the first page here) and labelled**, not stacked on top (a study of 2M Amazon results found top sponsored rows pushing better organic matches down; we avoid that). Usability research (Baymard) finds **"Load more" beats both pagination and pure infinite scroll** for product lists, and that **autocomplete works best with at most ~10 suggestions, the completion highlighted, arrow keys copying a suggestion into the box, and misspellings corrected**.

## The layers

```
Browser      React Query keeps every page asked for; the visit's rotation hour; IntersectionObserver prefetch; content-visibility
   │
CDN          one cache entry per canonical URL (s-maxage); the rotation hour is in the URL, so everyone in that hour shares it
   │
Edge         /api/products and /api/browse: memory snapshot (newest 10,000) + the hour's feed pool + per-query candidate cache
   │
Redis        optional shared copy of snapshots and feed pools (Upstash), never a single point of failure
   │
Postgres     indexes on items (full-text + trigram), the type-ahead dictionary and the trending lists rebuilt hourly by pg_cron
```

Every request does a bounded amount of work, whatever the size of the catalogue: one page of about 50, at most 600 search candidates
(after looking at no more than 10,000 matches), at most 12 suggestions from a small dictionary.

## The home feed ("Recommended")

`client/src/lib/feed.js`, run by `/api/products` (and by the browser as the fallback and in demo mode).

1. **Rotation hour ("epoch")**: whole hours since 1970. The page asks for the hour its visit started
   (`lib/feedEpoch.js`, kept in the tab's session for up to 3 hours), so **a visitor's order never changes under them**,
   through Load more, page links, Back and reloads. A new visit later gets the new hour, so the order rotates.
2. **Nothing created during that hour joins it.** A product a seller adds now cannot push the list down for someone on page 4;
   it joins the next hour's order (and appears at once under "Newest first", in search and in "Recently added").
   A young catalogue (fewer than 48 older products) is exempt: a list that short cannot shift anyway.
3. **Score** = 80% a random draw (per hour, per visit variant, per product) + 10% freshness + 10% a complete listing (picture,
   discount, verified shop). The draw decides almost everything, so **no product owns the top spot** and a product from deep in
   the catalogue can open the feed; the other 20% only nudges better listings up a little.
   **Variants**: each visit draws one of 8 orders for its hour (and keeps it), so two visitors in one hour do not both see the same
   first product, while the CDN still answers every repeat from cache (the page request carries `epoch` and `variant`).
4. **Featured (Premium) products**: on the first page exactly **half** the places (one of every pair, which of the two drawn per pair),
   so half the first page is featured but a featured product is no more likely to be first than an ordinary one, and never more
   than two in a row. After the first page, one place in seven at a drawn position in each seven. They keep the "Featured store"
   mark. No featured product left: the place goes to the next product, and the other way round.
5. **Variety**: a shop appears at most once in any 10 places in a row (looking ahead up to 120 products for another shop). A
   catalogue with too few shops for that alternates them instead of running one shop after another.
6. **Pool** (catalogue bigger than the snapshot): `products_feed_pool(epoch)` in SQL gives 240 featured (12 of each featured
   shop's 60 newest, a new draw every hour), 360 freshest (6 per shop) and 480 from a slice of the long tail that starts at a
   different place every hour, so every product comes round. Each part reads an index. The order is worked out once per hour
   and kept; the products behind it refresh every minute, so a removed or sold-out product simply drops out of its page.

## Loading and paging (`client/src/components/HomeProducts.jsx`)

* One page = about 50 cards, sized to the screen so every row is full: 50 on phones (2 columns), 51 (3), 52 (4, tablets and laptops), 54 (6, wide screens); first view 50–54, 150–162 after the two automatic pages. Each page size and page is its own cached request. Page links are the shared Previous / 1 2 3 … N / Next bar (client/src/components/Pagination.jsx), also used above "Related searches" on product search.
* **IntersectionObserver**, about one screen ahead of the end of the grid (never a scroll listener): fetches the next page in the
  background, and adds the first **2** pages by itself.
* Then a **Show more products** button adds one page per tap (already fetched, so instant) and the footer stays reachable.
* **Page links** 1-8 jump straight to a page (`?ppage=3`), work with Back, and mark the pages on screen.
* **Shallow**: 8 pages (192 products) at most. At the end: "That's the top of the list for now" with Search, Filters and
  Categories. Product search (`/products`) stops at 20 pages and suggests a filter.
* Cards far off screen skip layout and paint (`content-visibility: auto`); pictures are lazy and resized by Cloudinary.

## Search (`search_product_candidates`, migrations 0128-0130)

* `search_key()`: one immutable normal form (lower case, accents dropped, punctuation to spaces).
* `items_search_doc_idx`: full-text index on name (weight A) + brand and section (weight B). Every typed word is a **prefix**
  match: "brook mil" finds "Brookside Milk 500ml"; plurals are trimmed ("speakers" finds "speaker").
* `items_search_trgm_idx`: trigram index on the normalised name, for "contains" and similarity.
* The query is driven by the index (a `MATERIALIZED` step stops the planner from reading every item of every store), scans at
  most 10,000 matches, ranks (whole name, starts with, whole word, inside, how many words are in the name, newer) and returns
  600 in the snapshot's shape. `/api/products` adds them to the snapshot and runs the same ranking, filters and facets as before,
  so an old product is still found and nothing about the results page changes.
* **Misspellings**: no match at all -> each unknown word becomes the closest known word from the dictionary (same first letter,
  a few edits, the most common on a tie): "mlik powdr" -> "milk powder", shown as "Showing results for milk powder".

## Type-ahead (`search_suggest`, `client/src/components/SearchPanel.jsx`)

* A dictionary (`search_terms`, a few tens of thousands of rows) rebuilt every hour: what people search (with a slowly decaying
  popularity), every word and the first 1-3 words of product names, brands, sections, stores and categories, each phrase with one
  example product (picture, price, store). Units and joining words ("ml", "min", "pack", "with") are left out.
* "mi" -> one index range scan (`key LIKE 'mi%'`): **milk**, milk powder, mirror ... From 3 letters a word inside a phrase
  matches too ("mil" -> brookside milk); from 4, similar spellings. Nothing found: the word is corrected ("mlik" -> milk).
* Answered in 2-5 ms by the database, cached 5 minutes in the edge function and 10 minutes at the CDN. Before the first rebuild,
  or if the function is missing, the same rules run over the product snapshot (`lib/suggest.js`).
* The panel: 120 ms pause after typing; the previous answer stays (dimmed) while the next loads, so the list never blinks; up to 8
  completions (the part not typed in bold), 4 products with picture and price, stores, categories, then "See all products for ...".
  Arrow keys move through every row and copy a phrase into the box (Escape restores what was typed); the arrow button beside a
  phrase does the same with a tap. Products open the product, stores the store, categories the category.
* **The home page search bar opens search on its own** (`hooks/useOpenSearch.js`); the menu's search box opens it over the menu.

## Trending searches (menu and empty search panel)

> Superseded by migration 0141: see `docs/trending.md`. The hourly list below is still built and is the fallback for older clients.

`refresh_top_searches()` (hourly) stores the top 20 terms of the last 24 hours (at least 3 different searchers, blocklist
respected, flame for a 3-hour spike) with a picture from a matching product. `/api/products?op=trending` caches it until 5 minutes
past the next hour. If the job has not run for 3 hours, the live count is used.

## Deploy

1. Apply `0128_search_index.sql`, then `0129_items_search_trgm_idx.sql` and `0130_items_search_doc_idx.sql` (each one statement,
   `CREATE INDEX CONCURRENTLY`, no write lock; on millions of rows each takes a few minutes).
   A database that stopped part-way can run `supabase/catch-up-items.sql` (regenerated).
2. Run `supabase/cron/schedule.sql` again (adds `search-rollups`, hourly at :02) or `select public.refresh_search_rollups();` once.
3. Deploy the client. No new environment variables.
4. Check: `supabase/cron/verify.sql` section 5; `/api/products?op=suggest&q=mi` answers with `"source":"index"`.

## Measured

Local Postgres 16, 200,000 products in 2,000 stores, warm connection (as PostgREST keeps them):

| | Time |
|---|---|
| `search_suggest('mi')`, `('bro')`, `('mlik')` | 1-5 ms |
| `search_product_candidates` for a narrow query ("brookside milk 500ml") | ~0.45 s first call in a session, less after |
| ... for the broadest one-word query ("milk": 20,000+ matches, capped), warm | ~0.2 s |
| `products_feed_pool(hour)` | ~0.3 s, once per hour per instance (Redis shares it) |
| `refresh_search_terms()` (hourly job) | ~7 s (expect about 35 s per million products) |

Search answers are cached per query (CDN and edge memory), so only the first visitor to ask a new question pays.

## Limits and next steps

* **Filters on the home grid** (category, town, brand, size ...) still run over the newest 10,000 products. Moving those filters
  into SQL (faceted counts with the same indexes) is the next step once the catalogue is past ~50,000 products.
* **Dictionary rebuild** is a full pass: past ~5 million products, run it every 6 hours (`7 */6 * * *`) and keep trending hourly,
  or make it incremental (only items changed since the last run).
* **Beyond tens of millions of products**, or for "did you mean" across languages, synonyms per category and learning from
  clicks, put a search engine (Typesense, Meilisearch or OpenSearch) behind `search_product_candidates` and `search_suggest`. The
  endpoint contracts in this document stay the same, so the site does not change.
