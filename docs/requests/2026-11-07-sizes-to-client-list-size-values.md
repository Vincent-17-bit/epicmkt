# Sizes 1.8 to the product list: carry `sizeValues` on each product

- From: sizes 1.8      - To: client list / snapshot (Prompt 4.14)      - Date: 2026-11-07
- Status: open            (open | accepted | done | declined)
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
