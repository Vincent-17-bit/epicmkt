# A05 to admin: pages to edit size charts (with product types) and the shoe conversion chart

- From: a05      - To: admin      - Date: 2026-11-06
- Status: open            (open | accepted | done | declined)
- Contract: v1, A05 entry in docs/contracts/CHANGES.md

## Need
Two admin screens, using functions that already exist after migration 0093:

1. Size charts: list, create, edit, delete. `admin_size_charts_list()` (rows now include `product_type_ids`), `admin_save_size_chart(id, fields)` where
   `fields` is `{name, category, unit, columns, rows, active, product_type_ids}` (an absent `product_type_ids` changes nothing; `[]` releases every type), `admin_delete_size_chart(id)`.
   Validate in the form with `cleanSizeChart` (A04, `shared/src/seller/options.js`).
2. Shoe conversion chart: one editable table. Read with `select chart, version from public_shoe_conversion`, save with `admin_save_shoe_conversion(chart)`
   (returns the new version). `chart` is `{adult: [{eu, uk, usM, usW, cm}], kids: [{eu, uk, usM, usW, cm}]}`; adult rows need every size, kids rows need
   EU and cm (the others may be null); every column rises row to row; kids end below where adult starts. Validate in the form with
   `cleanShoeConversion(chart)` (`shared/src/sizeCharts.js`): it gives the same answer as the database and returns readable messages.

Errors from the database (P0001): `invalid_name`, `invalid_unit`, `invalid_category`, `invalid_chart`, `invalid_type_ids`, `duplicate_chart`,
`chart_not_found`, `size_chart_in_use` (delete: an item or a type uses it), `invalid_shoe_chart`. `forbidden` (42501) for anyone who is not an owner.

## Why
Admin cannot change the charts or the shoe conversion without it. An edit needs no code change or deploy; sizes already on items are stored as typed and do not change.

## Suggested change
Add the two pages to the admin navigation block (append-only, your own lines). `shoeTable(chart, "men" | "women" | "kids")` gives the rows a buyer sees,
so the page can preview them. `product_type_ids` are ids of existing `product_types` rows (A08); a type has one chart, so saving moves a type from its old chart (say so in the form) and a type left out of the list is released. Offer a picker of types.

## Meanwhile
The mock (`backend/src/index.js`) has `getSizeChartsForType`, `getShoeConversion` and `saveShoeConversion` with the same rules. Nothing is stubbed on the
admin side because there is no admin UI for charts yet.
