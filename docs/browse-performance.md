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
1. **One snapshot, shared.** `client/api/browse.js` builds the catalog snapshot with a single RPC (`0041_browse_snapshot.sql`,
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

## Deploy order
1. Apply `supabase/migrations/0041_browse_snapshot.sql`.
2. Deploy the client. The Vercel function needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (or `SUPABASE_URL` / `SUPABASE_ANON_KEY`).

## Not done yet (next)
- `flash/live.js getAllProducts` (home "all products") still pages every public item. Same treatment: server-side page + CDN.
- Main JS chunk is ~200 KB gzipped; audit it for what Home does not need on first paint.
- Anon role on Supabase has a short statement timeout; if `browse_snapshot()` ever times out the function falls back to paging.
- Redis (e.g. Upstash) can later sit behind `/api/browse` as a shared snapshot across instances. It is not needed first.
