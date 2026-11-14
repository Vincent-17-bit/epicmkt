# Wire `items.getRelated(itemId, page)` to the live adapter

- From: 8.1      - To: client (Prompt 8.5)      - Date: 2026-11-14
- Status: open
- Contract: v1, "8.1" in docs/contracts/CHANGES.md

## Need
Prompt 8.1 ships the data side only. The client needs `items.getRelated(itemId, page)` returning `{ items, page, pageSize, hasMore, total }`.
It replaces the earlier mock-only `getRelated(itemId, opts)` described in `2026-11-05-w0-to-client-items-list-and-related.md` for live items.

## How (same split as Similar items)
```js
const { data } = await supabase.rpc("related_item_candidates", { p_item_id: itemId, p_limit: 200 });
if (!data) return { items: [], page, pageSize: 10, hasMore: false, total: 0 };
return rankRelated(data.item, data.candidates, { relations: data.relations, page });
```
`rankRelated` is in `@epicmkt/shared`. Each result has `fromThisShop` for the "From this shop" label, plus `imagePaths`, `price`, `priceMin`, `priceMax`, `hasPriceRange`, `hasOptions`.
Demo mode: until `getRelatedItems` in `backend/src/services/items.js` is moved onto `rankRelated`, mock mode keeps its current behaviour. Mark any stand-in `// TODO(contract:8.1)`.

## Notes
- Failures should give an empty first page, as Similar items does, so the Recommend tab degrades to its empty state.
- No reviews or ratings are returned.
