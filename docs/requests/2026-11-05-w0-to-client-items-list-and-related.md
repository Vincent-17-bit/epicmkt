# Expose items.getList and items.getRelated on the client API

- From: w0      - To: client (Lane B)      - Date: 2026-11-05
- Status: open
- Contract: v1, "W0" in docs/contracts/CHANGES.md

## Need
`client/src/api/index.js` exposes `items.getDetail`, which already reaches the mock backend (so the 14 fixtures are served by id). It has no
`items.getList` or `items.getRelated`. The mock backend now exports `getItemList` and `getRelatedItems`; the client needs to route to them.

## Why
Lane B cannot list or relate typed items through `items.*` until these exist; the backend functions are only reachable by importing
`@epicmkt/backend` directly.

## Suggested change
In `client/src/api/index.js`, inside the `items` object (and, when the live adapter exists, the matching branch in `client/src/api/flash/`):

```js
getList: (opts) => backend.getItemList(opts),       // { productType, businessId, limit, offset } -> { items, total } of ItemListCard
getRelated: (itemId, opts) => backend.getRelatedItems(itemId, opts), // opts { limit, origin, signal } -> ItemListCard[]
```

Fixtures show up only in mock mode (no `VITE_SUPABASE_URL`), like the rest of the demo data.

## Meanwhile
Code against `@epicmkt/shared` (`isItemDetail`, `isItemListCard`, `getFixtures()` in tests) and mark the stand-in `// TODO(contract:W0)`.
