# Browse performance

## What was slow
`client/src/api/browse/live.js` made every visitor's browser download the whole catalog (`public_businesses` with `select *`,
all of `public_items`, flash sales and offers: up to 20 requests of 1,000 rows each) and then search, filter, sort and measure
distance in the browser. First load grew with every seller, and Supabase served identical data to every visitor.

## What happens now
```
browser ──GET /api/browse?op=search&...──▶ Vercel CDN ──(miss)──▶ edge function ──(memory snapshot)──▶ answer
                                              ▲ s-maxage=30, stale-while-revalidate=300     │
                                              └────────────────────────────────────────────┘
                                   snapshot refresh (every 30 s at most): ONE rpc browse_snapshot() ──▶ Supabase
```
1. **One snapshot, shared.** `client/api/browse.js` builds the catalog snapshot with a single RPC (`004200_browse_snapshot.sql`,
   slim columns, one lowest price per business) and keeps it in the instance's memory. Simultaneous refreshes collapse into one.
   If a refresh fails, the last good snapshot is served (up to 10 minutes). If the RPC is missing it pages the views with narrow columns.
2. **Pages, not catalogs.** The browser asks a question and gets one page (a few KB).
3. **CDN cache.** Answers carry `s-maxage` and `stale-while-revalidate`. `api/_lib/browseParams.js` makes URLs canonical
   (sorted keys, empty values dropped, coordinates rounded to ~110 m) so visitors share cache entries.
4. **Precomputed search.** Normalised search text, id/slug lookup and per-category counts are built once per snapshot; "open now"
   is computed once per business per minute.
5. **Safe fallback.** If `/api/browse` is unreachable (local dev, outage) the browser uses `liveLegacy.js`, the old path, running
   the same `engine.js`. The site gets slower, never broken.
6. **Smaller first load.** All pages except Home are route-split, and the page preconnects to Supabase.

## Home "Products" grid (`/api/products`)
Same idea, applied to `flash/live.js getAllProducts`, which used to download every public item (all image and video paths
included) plus every store into each visitor's browser.
```
browser ──GET /api/products?op=page&...──▶ CDN ──(miss)──▶ edge function ──(memory snapshot)──▶ 24 products
                                            ▲ s-maxage=60, stale-while-revalidate=300
                       snapshot refresh (every 60 s at most): ONE rpc products_snapshot() ──▶ Supabase
```
* `0043_products_snapshot.sql`: one round trip, slim columns (160-character search blurb, the FIRST image path only, the
  running flash sale already priced by the database), newest first, capped at 10,000 items (`truncated` says so).
  Measured on a local Postgres as `anon`: ~330 ms and ~6 MB for 10,000 products. It is a snapshot, not a page, so the cap
  keeps the function's memory bounded.
* Filtering, sorting and counting run `src/lib/productFilters.js`, the same code the UI used, so results are unchanged.
  Measured at 10,000 products: a page is 1 to 6 ms, facets 15 ms, live filter counts 24 ms.
* `op=page` (one page), `op=facets` (filter options, cached 5 min), `op=counts` (live option counts, only requested while the filter
  sheet is open).
* Once a minute the function re-checks every store's open/closed state and whether each flash sale is still running, so a stale
  snapshot never shows a sale that is over.
* The browser keeps the previous grid on screen while a new filter loads, and "Show more" fetches the next page only.
* Fallback: if the endpoint is unreachable the browser loads the full list (old path) and answers with the same functions.

## Shared copy in Redis (Upstash)
`client/api/_lib/redis.js`, used by both endpoints around their snapshot RPC. It is optional and can only make the site faster, never wronger.
```
instance memory ──(older than 30/60 s)──▶ Redis copy ──(older than 30/60 s)──▶ ONE rpc ──▶ Supabase, then written back to Redis
```
* **Same freshness as before.** The copy stores when the data was read from Supabase, and each instance counts its freshness from that
  moment, not from when it fetched the copy. Data is therefore never older than one window (30 s browse, 60 s products), exactly as without Redis.
* **Flash sales.** Products still re-check, once a minute against the clock, whether each sale is running, so a sale that ends disappears
  on time even from an older copy. A sale that starts, or a price a seller edits, appears within one window.
* **Never a single point of failure.** Redis missing, slow (2 s read limit), over quota or down: the endpoint reads Supabase as it did
  before. If Supabase fails and the Redis copy is under 10 min (browse) or 15 min (products) old, that copy is served; older is an error, as before.
* **Compressed.** The copy is gzip + base64 (about 6 MB of products becomes well under 1.5 MB), which keeps Upstash bandwidth and the
  10 MB request limit out of the way. The key expires after the stale limit.
* **Cost.** A refresh is one `GET`, plus one `SET` when the copy is stale. Free plan: 500K commands, 250 MB, 10 GB bandwidth per month.
  The Upstash pricing page does not say whether commands past 500K are blocked or billed; in either case the endpoints fall back to Supabase.
* **Check it works.** Upstash dashboard > Data Browser shows `browse:snapshot:v1` and `products:snapshot:v1`; the commands graph moves.
  Vercel logs show `[redis] ... failed` warnings only when something is wrong.

## Deploy order
1. Apply `supabase/migrations/004200_browse_snapshot.sql`, then `0043_products_snapshot.sql`.
   (`0042` was `0041_browse_snapshot.sql`; it clashed with `0041_product_ids.sql`, and the Supabase CLI refuses two files with one version.
   The function is `create or replace`, so applying it again under the new number is harmless.)
2. Deploy the client. The Vercel functions need `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (or `SUPABASE_URL` / `SUPABASE_ANON_KEY`).
   Optional: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` turn on the shared Redis copy (see "Shared copy in Redis").
   Redeploy after adding them; Vercel applies environment variables only to new deployments.
3. Check the Vercel function logs for `/api/browse` and `/api/products`:
   * `[products] snapshot built via rpc: N products, M stores, X ms` is the healthy line (one per instance per minute at most).
   * `snapshot failed (...); paging the public views instead` means the RPC hit the anon role's statement timeout (or is missing).
     The endpoint still works through the narrow-column fallback, but fix the cause: raise the timeout for `anon`
     (`alter role anon set statement_timeout = '15s';`) or apply the migration.
   * `refresh failed, serving the snapshot from N s ago` means stale-if-error is covering a database blip.

## Known limits and next steps
* Without Redis each Vercel instance builds its own snapshot, so a cold start pays one database call. With Redis (below) one copy is
  shared, but a seller's change still shows up only when the copy expires (30 s browse, 60 s products); nothing clears it early.
* Past about 10,000 public products the snapshot is capped to the newest 10,000. That is the point to move paging and filters into SQL.
* Main JS chunk is still ~208 KB gzipped; audit it for what Home does not need on first paint.
