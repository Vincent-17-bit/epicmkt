# Sizes 1.8 to the product list: carry `sizeValues` on each product

- From: sizes 1.8      - To: client list / snapshot (Prompt 4.14)      - Date: 2026-11-07
- Status: done            (open | accepted | done | declined)
- Contract: v1, "Sizes 1.6 and 1.7" entry in docs/contracts/CHANGES.md

## Need
Each product in the home list (the snapshot `client/api/products.js` runs over, and `items.getAll`) should carry `sizeValues`: an array of the stored scale
values of its sizes, `[{ scale, system?, value, unit?, width? }]`, one per option value on a size-like axis (shoe EU 41/42, storage 512 GB/1 TB, length 5 m/10 m,
screen 42 in). `[]` or absent for an item with no typed sizes.

## Why
The Size filter (`client/src/lib/sizeFilters.js`, `ProductFilters.jsx`) groups by scale and `sizeKey`, filters length and screen size by range, and sorts storage with `compare`.
It is finished and tested against fixtures. Without `sizeValues` in the list payload the Size section stays hidden (a product with no field has no sizes), so nothing breaks, but nothing shows either.

## Suggested change
Build `sizeValues` where the snapshot is built from the item's option axes: for an axis whose scale is known (`axis.scale`, a value's `stored`, or the product type table in `client/src/lib/scaleLabels.js` `AXIS_SCALES`),
parse each value with `scales.parse` and keep the stored result. Keep the list payload lean: stored values only, no labels. Cap at 40 per product (the axis limit).

## Meanwhile
`facetsOf`, `applyFilters`, `countsFor` and the page address (`psize`, `prange`) already read `sizeValues`. Tests use fixtures. Search for `TODO(contract:4.14)` in `client/src/lib/sizeFilters.js`.

## Done (migration 0104)
- `products_snapshot` carries `size_values` per item and `/api/products` turns it into `sizeValues` on each product (not sent to the browser per product).
- The server's page-the-views fallback and the browser's `getAllProducts` read `public_item_size_values()` in one call. If that function is missing or fails, products list as before with no Size section.
- Where the values come from: an axis's `scale` and each value's `stored` (migration 0104 stores them; the Options step now saves both). Items saved before that carry no `stored`, so
  they have no Size facets until the seller saves them again. Nothing is guessed from labels in SQL.
- The endpoint reads `psize` and `prange` (the same parameters as the page address), through `parseSizes`.
