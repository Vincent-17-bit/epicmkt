# Contract changes (append-only)

Every change to a contract (types, validators, fixtures, API names or payloads under `shared/src/contracts/`, and the mock API that serves
them) is logged here. **Append only:** add your entry at the bottom, never edit, reorder or delete an earlier one. To correct an entry, add a
new one that says what it corrects. On a merge conflict keep both sides.

Entry format:

```
## <YYYY-MM-DD> <ID>: <one-line summary>
- Contract: v<N>
- Lane / author:
- What changed:
- Why:
- Who must act: (lane and what, or "nobody")
- Request files: (docs/requests/..., or "none")
```

---

## 2026-11-05 W0: Contract v1 created, 14 fixtures, mock API serves them, test scripts use globs

- Contract: v1 (first version)
- Lane / author: Wave 0, staff engineer (contracts and tooling)
- What changed:
  - New `shared/src/contracts/`: JSDoc typedefs (`types.js`), the 13 product types (`productTypes.js`), validators (`validators.js`:
    `isProductType`, `isItemDetail`, `isItemListCard`, `isOptionAxis`, `isOptionVariant`, `isDimensions`, `isPriceTiers`, `isQuantity`,
    `isSellerCard`, the matching `check*` functions that list the problems, and `checkItemAgainstProductType`) and 14 fixtures
    (`fixtures/`, built lazily through `getFixtures()` / `getFixture(id)`). All exported from `@epicmkt/shared`; nothing is built at import time.
  - `ItemDetail` gains four fields: `productType` (id or `null`), `priceTiers` (list or `null`), `quantity` (`{min, step, unit}` or `null`),
    `dimensions` (or `null`). Option variants may carry `dimensions`, `weightGrams` and `priceTiers`; an option axis may carry `dependsOn`.
    Everything else keeps today's shape (`options`, `optionVariants`, `optionAvailability`, `sizeChart`).
  - No new `priceType`. Per kg is `{ priceType: "fixed" | "from", unit: "kg", quantity }`; tiers are `{ priceType: "from", priceTiers }`.
  - Mock API (`backend/src`): `getItemDetail` serves the 14 fixtures by id (`fx-*`); new `getItemList({ productType, businessId, limit, offset })`
    -> `{ items, total }`; new `getRelatedItems(itemId, opts)` (same product group for a fixture, the existing similar-items ranking
    for any other item); new `getSellerProductTypes()` (the mock of `seller_product_types`).
  - Fixture ids: `fx-phone`, `fx-sandisk`, `fx-shoes`, `fx-table`, `fx-sofa`, `fx-bread`, `fx-water`, `fx-led-strip`, `fx-led-bulb`,
    `fx-printing`, `fx-butcher`, `fx-necklace`, `fx-fragrance`, `fx-legacy`, all under the store `fixture-store` (`fx-store`).
  - Root `package.json`: `test:shared`, `test:db`, `test:fn`, `test:fn:db` and `admin/package.json` `test` use globs.
- Why: Lanes B and C build against these types and fixtures with no database; nobody edits a test list again.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - The phone's price follows the colour only (Black 25,000, Grey 24,000); the three storages (64, 128, 256 GB) do not change the price.
  - `ItemListCard.business` is the full `SellerCard`, as `getSimilarItems` returns, not the lean block `getAllProducts` returns. For that
    reason `getItemList` serves fixtures only; the real mock products stay on `getAllProducts` until the live list returns the same cards.
  - `getRelated` means "same product group, another item" for typed items.
- Who must act:
  - Client lane: expose `items.getList` and `items.getRelated` (request below).
  - Seller lane: expose the `seller_product_types` mock (request below).
  - Lane A (migrations): the live `items_detail`, list and `seller_product_types` must return these shapes. Not started.
- Request files: `docs/requests/2026-11-05-w0-to-client-items-list-and-related.md`, `docs/requests/2026-11-05-w0-to-seller-product-types.md`

## 2026-11-05 · A03 · Remaining measure scales

- What: 26 scales added under `shared/src/scales/remaining/` (new files only): `length`, `dimensions`, `bed-size`, `thickness`, `diameter`,
  `gauge`, `cross-section`, `tyre-size`, `paper-size`, `print-size`, `count`, `volume`, `weight`, `duration`, `portion`, `vehicle-class`,
  `compat-model`, `voltage`, `power`, `current`, `battery-capacity`, `color-temperature`, `ip-rating`, `gsm`, `frame-size`, `label`.
  Each is `{id, parse(raw, ctx), format(value, opts), sizeKey(value), compare(a, b), toBase(value), plausible(typeId, axisKey, value)}`;
  `registerRemainingScales(register)` and `REMAINING_SCALES` hand them to A02's registry. Rules and examples: `docs/contracts/scales.md`.
- Shape: the stored value stays `{scale, system?, value, unit?, width?, shape?}`; nothing was added to it. `sizeKey` is
  `scale:system:value[:unit]` with `-` for an absent system, so the scale id (always first) keeps scales from colliding.
- `plausible` answers `{ok:true}`, `{ok:true, warn}` or `{ok:false, warn}` (the `warn` text says why a value cannot be right).
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - `dimensions` stores the shape in both `shape` and `system`; `toBase` is an array of millimetres (one per part). `cross-section`
    does the same for `rect` and `area`.
  - A month counts as 30 days and a year as 365 days in `duration.toBase`; used only for ordering.
  - `bed-size`, `cross-section` (rect), `print-size` write the smaller side first, so `6x4` is stored as `4x6`.
  - `gauge` takes SWG numbers 8 to 36 or a thickness in mm; `paper-size` is a fixed list (A0 to A7, B4 to B6, C3 to C6, DL, Letter, Legal);
    `print-size` also reads the lab names 4R, 5R, 6R, 8R, 10R, 12R.
  - Units are stored lower case (`l`, `kw`, `mah`); `format` shows the proper label (`L`, `kW`, `mAh`).
- Who must act:
  - Lane A (A02): call `registerRemainingScales` (or spread `REMAINING_SCALES`) from `shared/src/scales/index.js`; swap `slugKey` for
    `normalizeValueKey` if you want one key function (`// TODO(contract:A02)` marks the spots). Add the files to `scripts/sync-shared.mjs`
    when the edge functions need them. Request: `docs/requests/2026-11-05-a03-to-a02-register-remaining-scales.md`.
## 2026-11-05 A02: Scale framework (Wave 1)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, prompt A02 (scales)
- What changed:
  - New `shared/src/scales/` with the registry API from Contract v1: `parse(scaleId, raw, ctx)`, `format`, `sizeKey`, `compare`, `toBase`,
    `plausible(typeId, axisKey, value)`, `validateAxisValues(axisDef, values, ctx?)`, plus `defineScale` / `registerScale` for plug-in scales.
  - Scales: `apparel-alpha`, `apparel-numeric`, `kids-age`, `collar-inch`, `shoe`, `screen-inch`, `storage`, `body-measure`, `ring-size`. Shoe conversion data is a plain
    table, `SHOE_CHART`. A02 had also written `volume` and `weight`; A03 merged first with its own, so A02 dropped its versions.
  - Registers the 26 A03 scales (`shared/src/scales/remaining/`) through `adoptScale()`; the registry holds 35 scales.
  - Exported from `@epicmkt/shared` as `scales` (namespace, because `parse`, `format` and `compare` are too generic for the package root) and flat:
    `sizeKey`, `validateAxisValues`, `registerScale`, `defineScale`, `listScales`. Table: `docs/contracts/scales.md`.
- Why: Wave 2 onward stores option values as `{scale, system?, value, unit?, width?}` and needs one place to parse, order and de-duplicate sizes.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - Parse errors are `{ code, message, needs?, options? }`; the brief only says `{ ok: false, error }`. A03's string errors are converted by `adoptScale()`.
  - `validateAxisValues` also merges same-size values typed in different units (1000 g = 1 kg) when the scale gives a numeric base.
  - `sizeKey` uses `-` when a scale has no system (the A03 convention); `width` is not part of the key.
  - `validateAxisValues` returns `{ ok, values, errors, warnings }`, merges duplicates, and orders values by `compare`.
  - `plausible` returns `ok: false` for a wrong scale or a value outside the hard limits, `ok: true` with `warn` for unusual values.
  - Contract v1 as shipped in `docs/contracts/v1.md` does not yet have `AxisDef.scale` or stored scale values; `validateAxisValues` reads only
    `axisDef.scale` and `axisDef.key`. Stand-in marker: `TODO(contract:A01)` where the type and axis shapes are assumed (see `plausibility.js`).
- Who must act:
  - Lane A (next prompts): give product types `AxisDef` axes with `scale`, and persist stored values; A05 admin editor for `SHOE_CHART`.
  - Whoever owns `scripts/sync-shared.mjs`: add `scales/*` and `scales/remaining/*` to the synced file list if the edge functions need them (request below).
  - A03: read `docs/requests/2026-11-05-a02-to-a03-registered-and-differences.md` (what was registered, and three things A03 may want to change).
- Request files: `docs/requests/2026-11-05-a02-to-supabase-sync-scales-to-edge-functions.md`, `docs/requests/2026-11-05-a02-to-a03-registered-and-differences.md`

## 2026-11-06 A18: Open values dictionary (typed material, colour, brand, finish, flavour)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, open values dictionary prompt (database)
- What changed:
  - Migration `0090_option_values.sql`: tables `option_values` and `item_option_value_uses`; `normalize_value_key(text)`; the contract's
    `seller_option_values(kind, query, limit)`; `seller_add_option_value(kind, label, hex)`; `seller_link_item_values(item, uses)`;
    `public_option_value_filter(kind)`; `admin_option_values`, `admin_approve_option_value`, `admin_update_option_value`,
    `admin_rename_option_value`, `admin_merge_option_value`. `seller_save_item` is not touched.
  - `shared/src/openValues.js`, exported from `@epicmkt/shared`: `normalizeValueKey` (the one canonical key function the contract lists),
    `cleanValueLabel`, `validateOpenValue`, `matchRank`, `matchOpenValues`, `isHexColor`, `VALUE_KINDS`, `VALUE_STATUSES`, `KEY_CASES`.
  - Shapes: a value is `{id, kind, label, key, status: pending|approved|merged, hex, tags[]}`. `seller_option_values` returns
    `{kind, query, matches: [value + uses], canAdd, addLabel}`; `seller_add_option_value` returns `{created, value}`; rename and merge return the value plus
    `itemsUpdated`. Errors are `P0001` messages: `invalid_kind`, `invalid_label`, `label_too_long`, `invalid_hex`, `too_many_pending` (50 per shop),
    `value_exists`, `value_merged`, `same_value`, `kind_mismatch`, `value_not_found`, `item_not_found`, `invalid_uses`.
- Why: a seller can type a material, colour or brand that is not listed; it is usable at once, shown as typed and queued for review; admin approves,
  renames or merges it and every item using it follows. "Samsung", "SAMSUNG" and "samsung" are one value, so one filter choice.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - Key rules: NFKD, accents dropped, NFC, lower case, apostrophes dropped, "&" read as "and", runs of spaces and punctuation become one space.
    Written in `openValues.js`; the db test runs one table (`KEY_CASES`) through both functions.
  - Items refer to a value through `item_option_value_uses(item_id, slot, value_id)`, slot `brand` (items.brand), `spec` (a spec row's value, also the
    per-variant rows) or `axis` (an option value's label; its id and so every variant combination stays). The app calls `seller_link_item_values` after
    `seller_save_item`. Rename and merge rewrite the item text found by key, only for linked items. Items with no links are untouched.
    TODO(contract:A01): when product types give typed spec rows and option values a `valueId`, point the rewrite at those.
  - A merged value keeps its key, so the old spelling resolves to the target; a merge never leaves a chain. Merging copies tags and fills a missing shade.
  - Rename is refused when another live value of the kind has that key (`value_exists`): merge instead. Rename keeps the status.
  - The admin functions need the `reviewer` role (owner always passes). There is no undo for a value merge.
  - A new value is always `pending`; there is no auto-approve.
- Who must act:
  - Seller lane: call `seller_option_values` for the type-ahead and `seller_add_option_value` for Add "<typed>"; call `seller_link_item_values` after a save.
  - Admin lane: a review page over `admin_option_values` and the three actions (`admin_*` names above).
  - Client lane: filter lists from `public_option_value_filter`.
  - Whoever owns `scripts/sync-shared.mjs`: add `openValues.js` if an edge function needs it (request below). No edge function uses it today.
- Request files: `docs/requests/2026-11-06-a18-to-supabase-sync-open-values.md`

## 2026-11-06 A08: Departments, selling restrictions and missing-type requests (Wave 1)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, prompt A08
- What changed:
  - Migration `0091_departments_restrictions.sql` (first written as 0089; renumbered twice, after `0089_break_exceptions.sql` and `0090_option_values.sql` reached main): tables `departments`, `product_types` (contract-shaped: `id, slug, name, kind, department_id, category_ids,
    restricted_to, quantity_mode, axes, spec_rows, size_chart_id, active`), `type_requests`; column `items.product_type_id` (null = Other goods).
  - **`restrictedTo[]` is a list of shop category ids** (`businesses.category_id`, the ids in `client/src/data/categories.js`). Empty or absent = any shop.
    Regulated: `prescription-medicine` -> `chemist`; `vet-medicine`, `agrochemicals` -> `agrovet`. Written in code in `shared/src/types/restrictions.js`
    (`REGULATED_TYPES`, `canSellType`, `sellableTypesFor`, `cleanTypeRequest`, `TYPE_ERRORS`) and a DB test keeps the seed equal to it.
    An unknown category in a restriction fails closed (nobody can sell the type).
  - `seller_save_item(uuid, jsonb)` accepts `productTypeId`: key absent = leave the type alone; `null` = Other goods; text = a type the shop may sell.
    Errors: `type_not_allowed`, `unknown_product_type`, `invalid_product_type`. It is now a thin wrapper over the 0086 function, renamed
    `seller_save_item_base` (no browser grant). A trigger on `items` enforces the same rule for every writer. `seller_check_item` reports the same code as
    `{ok:false, issues:[{code}]}`.
  - `seller_request_type(name, note)` -> request id. Name 2-80 chars, note up to 500, one open request per shop per name (asking again returns the open one),
    at most 20 open per shop (`too_many_type_requests`). A seller may `select` their own rows from `type_requests`.
  - `admin_type_requests_list(status default 'pending')` (`pending | resolved | declined | all`) -> rows `{id, name, note, status, created_at, resolved_at,
    resolvedTypeId, adminNote, businessId, businessName, sellerId, categoryId, alsoAskedBy}`.
    `admin_resolve_type_request(id, outcome 'resolved'|'declined', type_id?, note?)`: owner or reviewer; declining needs a note; a closed request
    cannot be resolved again (`type_request_closed`). Audited as `type_request.resolved` / `type_request.declined`.
  - `seller_product_types()` -> `{ departments: [{id, name}], types: [ProductType] }`, leaving out types this shop may not sell. `restrictedTo` and
    `sizeChartId` appear on a type only when set.
- Why: sellers need departments and a type picker that never offers regulated goods to the wrong shop; a missing type must not block adding an item.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - A06 is not merged, so `product_types` is created here, seeded with only five types (the regulated three, `fragrance`, `stationery`).
    `// TODO(contract:A06)` marks the seed, the `seller_product_types` body and `REGULATED_TYPES`. A06 must add its types with
    `insert ... on conflict (id) do update` and add columns with `add column if not exists`; `fragrance` keeps the W0 id.
  - Departments: the 13 named ones plus one per live category group (water-energy, food-drink, medicine-health, ...), not one per live category.
  - A type's restriction is checked when the type is set or changed, not on every edit, so an item stays editable if the shop later changes category.
  - Admin list/resolve are SQL RPCs called straight from the admin app (as the other `admin_*` are), so `supabase/functions/**` is unchanged.
- Who must act:
  - Seller lane: wrappers for `seller_product_types` and `seller_request_type`; send `productTypeId` from the editor (request below).
  - Admin lane: a type-requests page on the two admin RPCs (request below).
  - Lane A (A06): merge with the tables above; see the assumptions.
- Request files: `docs/requests/2026-11-06-a08-to-seller-type-picker-api.md`, `docs/requests/2026-11-06-a08-to-admin-type-requests-page.md`

## 2026-11-06 A18b: Open values screens and wiring (seller, admin, buyer)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, at the owner's request, because A18 left these three screens undone. They touch the seller, admin and client apps, so the other lanes should review them.
- What changed:
  - Migration `0092_products_snapshot_brand.sql`: `products_snapshot` also returns each item's `brand` (one extra column; signature and paging unchanged).
  - Seller: `findOptionValues`, `addOptionValue`, `linkItemValues` in the seller API (live, mock, contract list); a `ValueField` type-ahead (ARIA combobox) used for Brand in the item editor;
    on save the editor settles the brand against the dictionary (typed "SAMSUNG" saves as the existing "Samsung") and calls `seller_link_item_values`. A dictionary failure never blocks a save.
  - Admin: page `/admin/open-values` (nav item under Catalogue): waiting / approved / merged / all, kind filter, search, approve, rename, merge (with an "N items will become X" warning), tags and shade.
    New permissions `values.view` and `values.review` (reviewer; owner implied), matching `has_role(array['reviewer'])`.
  - Buyer: a Brand filter on the home products (`pbrand` in the address, one choice per brand key, named by the most used spelling, live counts, removable chip). Grouping is done with `normalizeValueKey`.
- Assumptions (change with a new entry, not by editing this one):
  - The editor owns only the `brand` slot of `seller_link_item_values`. The call replaces ALL of an item's links, so when spec or option values become dictionary values (TODO(contract:A01)) the editor must send every slot it owns.
  - The buyer filter groups on the brand text in the snapshot, not on the link table, so it also works for items saved before the dictionary existed.
  - `public_option_value_filter` (0090) is not used by the client yet; the snapshot route needs no extra request. It stays available for a standalone brand list.
  - Only Brand is typed-ahead in the seller editor today; material, colour, finish and flavour fields come with product types (A01).

## 2026-11-06 - A05: size charts by product type, and the shoe conversion chart (Lane A)

- Migration `0093_size_chart_types_shoe_conversion.sql`. Nothing from A04 (`0086`) or A08 (`0091`) is removed or renamed.
  - The link between a type and its chart is the contract's `ProductType.sizeChartId`, stored in `product_types.size_chart_id` (A08 added the column and
    `seller_product_types` already returns it). A05 adds the foreign key (`on delete restrict`). A type has ONE default chart; an item can still pick any chart
    (`items.size_chart_id`) and override its rows (`items.size_chart_override`).
  - `public_size_charts` and `admin_size_charts_list` gain `product_type_ids`, worked out from that column (appended; existing readers are unaffected).
  - `admin_save_size_chart` accepts `product_type_ids`: it points those types at the chart (a type moves from its old chart) and releases the types left out.
    An absent key changes nothing; null or `[]` releases all. Error `invalid_type_ids` (a type that does not exist, a repeat, a non-list, more than 20).
  - `admin_delete_size_chart` also refuses a chart that a type uses (`size_chart_in_use`).
  - `size_charts_for_type(p_type, p_category default null)`: public. The type's chart; if the type has none, the category's charts that no type uses.
  - `attach_default_size_charts()` (service role, safe to repeat) points the types `dress` and `shirt` at the seeded charts when they have none.
  - `shoe_conversion` (one row) holds `{adult: [...], kids: [...]}` in the shape of `shared/src/scales/shoeChart.js`, plus `version`. `public_shoe_conversion`
    is the public read. `admin_save_shoe_conversion(chart) -> version` is owner only, validated by `shoe_chart_valid`, audited.
  - Seeds: Dresses and tops (cm), Shirt collar, Men's shoes, Women's shoes, Kids clothes (age), and the default shoe conversion chart.
- `shared/src/sizeCharts.js`: `convertShoe(value, toSystem, chart?)`, `cleanShoeConversion`, `shoeChartFrom`, `shoeChartRows`, `shoeTable`,
  `pickSizeChart({item, type, charts})`, `SEED_SIZE_CHARTS`. Exported from the shared barrel. Errors from `convertShoe` use A02's `{code, message}` shape
  (`unknown-system`, `out-of-range`, `no-equivalent`, plus the shoe scale's own codes for text input).
- Backend mock: `getSizeChartsForType`, `getShoeConversion`, `saveShoeConversion`. `listSizeCharts` keeps its six keys (the seller app and its test read them).
- Assumptions (change with a new entry, not by editing this one):
  - The men's and women's shoe tables are size charts built from the one conversion chart (which stores both US columns in each row, as A02's `SHOE_CHART` does).
    Because a type has one chart, neither is a type's default; a seller picks one per item.
  - `dress` and `shirt` are guesses at A06's type ids. A06 should call `select attach_default_size_charts()` after it seeds its types (or set `size_chart_id` itself).
  - Charts are chosen for a buyer in this order: the item's own `size_chart_id` (with its override), then the type's chart, then the category's chart that no type
    uses (`pickSizeChart`). A06 applies it in `items.getDetail`.
- Who must act:
  - Admin lane: pages for charts and the shoe chart (`docs/requests/2026-11-06-a05-to-admin-size-chart-and-shoe-conversion-pages.md`).
  - Lane A (A06): `admin_save_product_type` should keep `size_chart_id` (or leave it alone); call `pickSizeChart` in `items.getDetail`; use `convertShoe` to show a size in the buyer's system.
  - Edge functions: `shared/src/sizeCharts.js` is not synced; add the `sizeCharts.js` and `seller/options.js` entries to `scripts/sync-shared.mjs` when a function needs them.

## 2026-11-08 — Admin: Size charts and shoe conversion pages (prompt 1.9)

- New admin page `Catalogue → Size charts` (`/admin/size-charts`). Tabs: **Charts** (list, search, create, edit, duplicate, delete) and **Shoe conversion** (Adult and Kids tables, reset to default, preview by audience, "try a size").
- Permissions: `sizecharts.view` (reviewer, support) and `sizecharts.edit` (owner only, matching the database).
- `shared/src/chartUnits.js` (`convertCell`, `measurementColumns`, `chartInUnit`, `canToggleUnit`, `matchRow`) now lives in shared and is exported from the barrel. The client keeps its copy in `client/src/lib/chartUnits.js` until it re-exports from shared.
- Admin API: `listSizeCharts`, `listProductTypes`, `saveSizeChart`, `deleteSizeChart`, `getShoeConversion`, `saveShoeConversion` (mock and live; live uses the 0093 RPCs).
- `useTableLabels` skips tables inside `[data-no-cards]`, so a grid or chart preview stays a real table on a phone.
- Left undone: assigning a chart to one item from admin (no admin RPC exists; sellers choose per item).

## 2026-11-12 — Admin: a size chart for one single item (migration 0100)

- `admin_set_item_size_chart(item, chart)` (owner only; chart null clears; the chart must exist and be active; a different chart drops the item's own row edits; audited as `item.size_chart`; setting the same chart again changes and audits nothing).
- `admin_items_for_size_chart(chart, query, limit)` (owner, reviewer, support): the items on a chart, or items matching a name search (a `%` or `_` in the search is plain text).
- Admin: the chart editor has an "Items on this chart" section (look, search by name, put an item on the chart, take it off). Admin API: `listItemsForSizeChart`, `setItemSizeChart` (mock and live).
- Sellers still choose a chart on their own items through `seller_save_item`; this is for fixing a wrong chart without the seller.
## 2026-11-07 - Sizes 1.6 and 1.7: size chart modal, scale-aware option labels (buyer)

- Two OPTIONAL, additive fields on option data. Nothing is removed or renamed; an item without them reads exactly as before.
  - `axis.scale`: a scale id (`shoe`, `collar-inch`, `storage` ...). The buyer page parses each value's label with it.
  - `value.stored`: a stored scale value `{scale, system?, value, unit?}` for one option value. It wins over `axis.scale`.
- Assumptions (change with a new entry, not by editing this one):
  - With neither field, the scale comes from `client/src/lib/scaleLabels.js` `AXIS_SCALES`: product type id + axis key (`shoes-eu.size` -> shoe, `sofa.seats` -> count,
    `phone.storage` -> storage, `led-strip.length` -> length ...). An item with no product type is never rewritten.
  - A label that does not parse stays exactly as the seller wrote it. The option value id is never changed, so a buyer's choice and the `?v=` link survive a system switch.
  - The shoe system (EU, UK, US men, US women, cm) is the buyer's, remembered in `localStorage` (`epicmkt-shoe-system`); else the system the item's first shoe value is written in; else EU. No shop sets it.
  - A variant's `dimensions` `{length, width, height, unit}` is shown as "Size: 160 × 88 × 85 cm" for the selected option.
  - The size chart link sits in the header line of the first size-like axis (key or label matches size, collar, shoe, waist, fit), else the first axis. It is hidden when `item.sizeChart` is null.
  - `ui` `Modal` gains `variant="sheet"`, a page scroll lock and focus return to the opener. Existing callers are unchanged (the defaults keep a centred card; scroll lock and focus return are on by default and harmless there).
  - The collar scale formats as `16"`; the item page shows `16 in` as the prompt asks.
## 2026-11-12 — Seller: scale value editors (prompts 1.4 and 1.5)

- `seller/src/components/values/scale/`: `ScaleValuesEditor` (any registered scale) and named wrappers for choice (`label` scale), count, volume, weight, duration, portion, voltage, power, ip-rating, colour temperature (1.4) and apparel alpha/numeric, kids age, collar, shoe, screen, storage, length, bed size, tyre, paper (1.5). `valuesEditorFor(scaleId)` picks one.
- `DimensionsEditor` / `DimensionForm` / `OptionDimensionsEditor`: labels from the type (table L x W x H, sofa W x D x H, door W x H, round table Diameter x Height), unit cm/m/in/ft, plausibility warns and never blocks, one size per option for sofas.
- `scales` now also exports `dimensionLabels`, `dimensionProfileId`, `DIMENSION_PROFILES` (additive; edge copy synced).
- Values are always stored scale values; same size twice merges by sizeKey (and by base amount) with a quiet status message.
## B07: Options step and dependent options editor (Prompts 3.2, 3.3)

- New `shared/src/options/editor.js`, exported from `@epicmkt/shared`: `emptyOptionsForm`, axis/value/row operations, `dependentSets` and friends, `summarize`/`summaryText`, `checkOptions`, `optionsFromServer`, `optionsPayload`, `effectiveLimits`/`limitMessage`. No contract shape changed: the save still sends `options: { axes, variants, defaultChoice }` as in migration 0086.
- Seller editor: the Options step is live (`steps/OptionsStep.jsx`, `steps/options/*`): axes, combinations, dependent lists, "Fill prices faster" (same price, by one option, base + difference) and plain price-typo warnings. Prices are always stored per combination.
- Type axes: a product type's `axes` (`{ key, label, display, scale? }`) give a one-tap "Use the usual options" start; values on a scale axis go through `scales.parse/format`. Seller fixtures (`AddItem.fixtures.js`) now carry axes for Dress, Shoes, Perfume and Phone. `TODO(contract:A06)` until the real `seller_product_types` returns them.
- Plan caps: the subscription's `limits[planKey].options` (`{ axes, values, variants }`) can lower the hard limits (3 / 40 / 200); the mock sends them for both plans. Missing means the hard limits.
- Custom size (Prompts 3.4 and 3.7): `shared/src/options/customSize.js`, `client/src/components/item/CustomSize.jsx`, `steps/options/CustomSizeEditor.jsx`, all tested but OFF (`CUSTOM_SIZE_STORED = false`) until the data layer stores `customSize`: see `docs/requests/2026-11-07-b07-to-data-custom-size-storage.md`.

## 2026-11-07 A-tiers: Quantity tier pricing (tiers.js, migration 0094, seller_save_item, priceFor)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, quantity tier pricing prompt
- What changed:
  - `shared/src/pricing/tiers.js`, exported from `@epicmkt/shared`: `validateTiers(tiers, mode)`, `priceTiered({tiers, mode, qty, adjust})`, `nextTierHint`, `tierIndex`, `kesText`, `TIER_MODES`, `TIER_LIMITS`.
  - Tiers keep the contract shape `{minQty, maxQty, unitPrice}`; the mode is stored beside them: `whole` (the tier price applies to every unit) or `graduated` (each band at its own price).
  - `priceFor` (shared/src/pricing.js, from the pricing core) now uses `tiers.js`: it reads `priceTierMode` (variant, else item, default `whole`), prices graduated bands (each band after the sale or flash price), and returns two new fields: `next` (`{from, more, unit, text}`, e.g. "Add 3 more for KES 7 each", or null) and `bands` (graduated only, else null). In graduated mode `unit` is the average per unit and `total` is exact; an offer is checked against that average. Invalid tiers fall back to the regular price. Existing results are unchanged for items without tiers or with whole tiers.
  - Migration `0094_price_tiers.sql`: `items.price_tiers`, `items.price_tier_mode` (default `whole`), `item_variants.price_tiers`; `price_tiers_valid(jsonb)`; `seller_save_item` is wrapped again (the 0091 text is now `seller_save_item_typed`, no browser grant).
  - `seller_save_item` accepts `priceTiers` (list or null), `priceTierMode`, and `options.variants[].priceTiers`. Key absent = leave alone; null = clear. Errors: `invalid_price_tiers`, `tiers_need_from_price`, `item_in_flash_sale`.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - Tier prices are whole amounts of 1 or more, like the rest of the pricing core (integer shillings); at most 10 tiers; quantities up to 1,000,000; no extra keys on a tier; `maxQty` must be present (null on the last tier).
  - The mode belongs to the item; a variant's own tiers use the item's mode unless the variant sets `priceTierMode`.
  - An item with tiers (or with tiers on any combination) must be priced `from`, as the contract validator already says for items.
  - Tiers cannot change while the item is in a scheduled or live flash sale (same rule as price).
  - Flash with tiers: the sale price or flash price is applied to each tier's price (the lower of the two, as for any listed price); a flash sale price never raises a tier price.
  - There is no save edge function; the save is SQL, so `supabase/functions/**` is unchanged. SQL and JS validation are kept equal by `supabase/tests/price-tiers.test.mjs`.
  - Graduated tiers apply to whole quantities; a measured (fractional) quantity is priced as `whole`.
- Who must act:
  - Seller lane: send `priceTiers` and `priceTierMode` from the editor.
  - Whoever builds `items.getDetail`: return `priceTiers`, `priceTierMode` and each variant's `priceTiers`.
  - `seller_duplicate_item` does not copy tiers yet; `seller_check_item` does not report tier issues yet.
- Request files: none

## 2026-11-07 A-flash-combo: Flash sale per combination (migration 0095, validateFlashVariants)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, flash sale per combination prompt
- What changed:
  - Migration `0095_flash_per_combination.sql`: `flash_sales.variant_target` (`all` default | `chosen`); `variant_overrides` (0013) now carries `{combo, type, value}` entries, `type` being `percent | amount_off | sale_price`, `combo` the `item_variants.combo_key` (`colour=black|storage=64`). Older `{variantId, salePrice}` entries stay valid and are ignored.
  - A trigger `t_flash_sales_variants` (the 0013 trigger is untouched) refuses bad overrides. Errors (P0001): `invalid_flash_overrides`, `flash_needs_combinations`, `invalid_flash_target`, `discount_too_large`, `sale_price_not_lower`. Changing `variant_target` after the sale starts is `flash_locked`, like the other flash fields.
  - `public_flash_sales` gains two last columns: `variant_target` and `variant_flash` (`[{combo, choice, regularPrice, salePrice}]`, only combinations on sale, or null). `sale_price` for a sale with `chosen` or with overrides is the lowest price a buyer can pay across the sold combinations; a sale with neither is priced exactly as before.
  - `public_item_options(item)` (renamed inner `public_item_options_base`) adds `flash` to every `optionVariants[]` entry while the item has a live sale: `{type, value, regularPrice, salePrice, endsAt}` or `null`. With no live sale the payload is unchanged.
  - `shared/src/flash/validateFlashVariants.js`, exported from `@epicmkt/shared`: `validateFlashVariants(flash, item)` -> `{ok, errors:[{code, combo?}], targets:[{combo, regularPrice, salePrice}]}`, `flashComboPrice`, `overridesShapeValid`, `FLASH_TARGETS`, `FLASH_OVERRIDE_LIMIT`. Input `flash` is `{discountType, discountValue, variantTarget, variantOverrides}`.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - A sold combination is a stored `item_variants` row with its own price whose status is not `unavailable` (the pricing core's `isSold`). Out of stock combinations can still be put on sale. A combination with no price of its own is not sold and cannot be targeted.
  - A combination's regular price is its own price. Variant `sale_price` is ignored.
  - With `all`, a discount that cannot lower a combination (amount off above its price, sale price above it) skips that combination instead of refusing the sale; an explicit override that cannot lower its combination is refused.
  - With `chosen` the sale's own `discount_type` and `discount_value` are still required and are checked against the item price by the 0013 rules, but are not applied to combinations that are not listed.
  - The database function cannot call the JS file, so the same rules are written in SQL and `supabase/tests/flash-per-combination.test.mjs` runs one table of cases through both.
  - `priceFor` reads the new shape: `shared/src/pricing/deals.js` gains `flashTarget(sale, item, variant)`, which resolves `sale.variantTarget` and `sale.variantOverrides` entries `{combo, type, value}` through `comboKey` (this settles `TODO(contract:A01)`); older id entries behave as before. A tier price takes the combination's flash per unit.
- Who must act:
  - Seller lane: the flash form can send `variant_target` and `variant_overrides` in the existing insert.
  - Client lane: show `optionVariants[].flash` and `variant_flash`.
  - Whoever maps the public flash sale into `item.flash`: pass `variantTarget` (from `variant_target`) and `variantOverrides` (from `variant_overrides`) as they are; `priceFor` does the rest.
  - Whoever builds `items.getDetail`: carry the per-variant `flash` where the buyer page wants it.
- Request files: none

## 2026-11-07 A-price-range: Denormalised price range and list payloads (migration 0096, mock getItemList)

- Contract: v1 (additive; nothing existing changes)
- Lane / author: Lane A, denormalised price range prompt
- What changed:
  - Migration `0096_price_range_columns.sql` adds to `items`: `price_min`, `price_high`, `has_options`, `department_id`, `has_3d`. `product_type_id` already existed (0091). The brief's `price_max` is NOT a new column: `items.price_max` already holds the seller's "range" top, so the highest price a buyer can pay is stored as `price_high` and is called `priceMax` in payloads.
  - `price_min` / `price_high` are the lowest and highest price one unit costs a buyer now, following the pricing core's `priceBounds`: over sold combinations (own price, status not `unavailable`), in-stock ones first (all of them when none is in stock). Per combination: its sale price, the first quantity tier's price (quantity 1), and a live flash sale on that combination. Whole KES. Offers are not included. A `range` item keeps its seller range (`price_max` as the top); price types other than fixed, from and range, and items with no price, have null. Legacy id-shaped flash overrides count as 'all' in the database.
  - Backfill: every existing item is computed once; an item with no options, tiers or flash gets `price_min = price_high = price` (a `range` item gets `price_max` as its top).
  - Kept by triggers on `items` (every insert and update; a direct write to these columns is overwritten), `item_variants`, `flash_sales` and `product_types`, so `seller_save_item`, bulk edits, the flash sweep and admin changes are all covered. A flash that starts or ends by the clock shows when the sweep next runs (within a minute).
  - `public_items` gains the last columns `price_min, price_high, has_options, department_id, product_type_id, has_3d`.
  - `products_snapshot` items gain `price_min, price_max (= price_high), has_price_range, has_options, department_id, product_type_id, has_3d`. `search_businesses` and `search_facets` use `min(price_min)` for `from_price`, so the price filter and the price sorts use what a buyer can actually pay.
  - Mock: `getItemList` and `getRelatedItems` cards carry `priceMin, priceMax, hasPriceRange, hasOptions, departmentId, productTypeId, has3d`; `getItemList` takes `minPrice`, `maxPrice` and `sort` (`price_asc` | `price_desc`) on `priceMin`.
- Assumptions made where the brief left room (change them with a new entry, not by editing this one):
  - `has_options` is true when the item has option axes or the older variants list. `department_id` is the product type's department, null when there is no type.
  - `has_3d` stays false: nothing in the repo stores a 3D view yet (`view3d` is only named in the contract). Whoever adds it sets the column in the same change.
  - `hasPriceRange` is `priceMin < priceMax`, worked out where the payload is built (the snapshot returns it as `has_price_range`).
  - Fixture product types carry no `departmentId`, so the mock's `departmentId` is null (`TODO(contract:A-dept)`).
  - The existing test `listings.test.mjs` pins the column list of `public_items`; its expected tail now includes the six new columns.
- Who must act:
  - Client lane: read `price_min`, `price_max`, `has_price_range`, `has_options`, `department_id`, `product_type_id`, `has_3d` from the snapshot; show "From" when `has_price_range`.
  - Whoever builds `items.getList` for real: return the camelCase names above from `public_items`.
- Request files: none

## 2026-11-11 A-tiers-followup: duplicate keeps tiers (migration 0097)

- Contract: v1 (additive)
- What changed: `seller_duplicate_item` now also copies `price_tiers` and `price_tier_mode` of the item and `price_tiers` of each combination (the previous function is kept as `seller_duplicate_item_base`, service_role only). `seller_check_item` already reported `invalid_price_tiers`, `tiers_need_from_price` and `item_in_flash_sale` because it runs the real save; tests now pin that.

## 2026-11-12 A-range-followup: legacy flash targets in the price range (migration 0098)

- Contract: v1 (additive)
- What changed: a flash sale saved with the older id entries (`{ variantId }`) now applies only to the listed combinations in `price_min`/`price_high` and in the `flash` of `public_item_options`, as `priceFor` does (new `flash_variant_price`). Items are recomputed once.
- Decision: offers stay out of the stored range. They depend on the shop's time of day and weekday and mostly change the total for a quantity, so they are not a stable "from" price; they are shown as offer badges. The mock list range ignores offers to match.
- Not changed: `public_flash_sales.variant_flash` still treats id entries as "all" (its rows carry no variant id yet); `has_3d` stays false and `test:fn` needs Deno.

## 2026-11-12 5.2: Specification rules engine (specRows on product types)

- Contract: v1 (additive)
- Lane / author: Group 5, Prompt 5.2
- What changed:
  - `ProductType` gains an optional `specRows: SpecRowDef[]` (`{key, label, level, input, choices?, requiredIf?, showIf?}`, at most 4 required). `checkProductType` validates it. Defined for `phone` (warranty required), `bread` (ingredients, allergens) and `drinking-water` (water type).
  - New `shared/src/specRules/`: `specIssues(item, type, { grandfathered })` returns `{blockers, warnings, score}`; `GENERIC_GOODS_TEMPLATE` (nothing required) is used when the type is null or has no `specRows`; `checkSpecRows`. An issue is `{key, label, level, message}`.
  - A row's value is the item's `specs` entry with the same label (case, accents and punctuation ignored); `brand`, `pack-size` and `includes` also read `item.brand`, `item.packSize`, `item.includes`.
  - Fixtures `phone`, `bread`, `drinking-water` now carry the required spec values.
- Not done: `requiredIf` and `showIf` are stored but not evaluated (5.3); server gate (5.4); `specIssues` is not yet in `sync-shared` (5.4 adds it).
- Who must act: nobody.
- Request files: none

## 2026-11-12 5.3: Conditional rules and state label sets

- Contract: v1 (additive)
- Lane / author: Group 5, Prompt 5.3
- What changed:
  - `SpecRowDef.requiredIf` and `showIf` are now evaluated. A condition is `{row, equals | in | tag | present}`, or `{all: [...]}`, `{any: [...]}`, `{not: {...}}`. `requiredIf` true makes the row required; `showIf` false hides the row (no issue, not scored). Rows with `requiredIf` count toward the four-required limit. `checkSpecRows` validates conditions.
  - `tag` conditions read the tags of the row's value from `specIssues(item, type, { tags })`, where `tags` is `{ [normalizeValueKey(value)]: string[] }` or `(value, row) => string[]`. Callers fill it from the open values dictionary.
  - `SpecRowDef.labelSet` (`condition`, `authenticity`, `fragranceState`, `chargerKind`) gives a choice row a fixed list. `LABEL_SETS`, `labelFor`, `rowChoices` in `shared/src/specRules/labels.js`. Authenticity has only original and inspired.
  - A choice row whose value is not in its list is an issue with `code: "invalid"` (blocker when required). Every issue now has `code: "missing" | "invalid"`.
  - A row is also answered by an option axis with the same key (the necklace purity axis).
  - `gold-necklace` gets rows (material required; purity required when the material has the tag `precious-metal`); `fragrance` gets authenticity (required) and fragrance state. Fixtures `necklace` and `fragrance` carry the matching spec values.
- Who must act: whoever calls `specIssues` with real data (5.4) passes `tags` from `option_values`.
- Request files: none

## 2026-11-12 5.4: Publish gate on the server (migration 0100)

- Contract: v1 (additive)
- Lane / author: Group 5, Prompt 5.4
- What changed:
  - `item_check_publish(item jsonb)` returns `{canSave: true, canPublish, grandfathered, blockers[], warnings[], score}`; issues are `{key, label, level, code: "missing"|"invalid", message}`, the same list `specIssues` gives. Input: `{id?, productTypeId, specs:[{label,value}], brand, packSize, includes, axes}`. Prompt 11.1 calls it. `item_spec_issues(item, grandfathered)` is the engine (service_role).
  - SQL twin of `shared/src/specRules` (`spec_*` functions); `supabase/tests/publish-gate.test.mjs` runs both on the fixtures and on edge cases and requires equal answers. Change both together. In the database an empty `product_types.spec_rows` means "no rows defined" and uses the generic goods template.
  - Trigger `items_spec_gate` on `items`: an item cannot become live (`draft = false and visible`), and a live item cannot have its type, specs, options, brand, pack size or includes changed, while a blocker exists. The error is `publish_blocked` (P0001) with the blocker list in `detail`. Drafts and hidden items always save. A tampered client or any other writer is covered because it is a table trigger.
  - Grandfathering: `items.spec_gate_exempt` is true for every item that was not a draft when the migration ran. The first real edit (even while hidden) turns it off for good; until then the item stays live, can be renamed, repriced, hidden and shown, and `item_check_publish` reports its blockers as warnings with `grandfathered: true`.
  - `seller_check_item` is unchanged unless the fields carry `publish`. With `publish` (true or false) the answer adds `spec` (the `item_check_publish` result); with `publish: true`, blockers also make `ok` false and add issues `{code: "spec_missing"|"spec_invalid", key, label, level, message}`. Fields not sent are read from the stored item.
  - `product_types.spec_rows` may hold at most four required rows (a row with `requiredIf` counts); `fragrance` gets its rows. `specRules` and `openValues.js` are now copied to the edge functions by `sync:shared`.
  - Tags for `requiredIf: {tag}` come from `option_values.tags`, following a merged value to its target.
- Not changed: `seller_save_item` (A04 owns it). A new typed item reaches live through `seller_bulk_items('show')`, which now raises `publish_blocked` for the whole call when any item in it is blocked.
- Existing test adjusted: `type-restrictions.test.mjs` retypes a live item to fragrance with a raw update; it now also sets the Authenticity spec the gate requires.
- Who must act: J01 / 11.1 call `item_check_publish`; the seller editor (5.7) sends `publish` to `seller_check_item` and shows `spec` and `issues`; `seller_bulk_items` could skip blocked items instead of failing the call (see request).
- Request files: docs/requests/2026-11-12-g05-to-j01-publish-gate-wiring.md

## 2026-11-12 1.10: sellers write their own size guide (migration 0103)
- Contract: v1 (additive)
- Lane / author: seller + data
- What changed: `items.size_guide` (jsonb `{unit?, columns, rows}`, same shape rules as a size chart); `seller_set_item_size_guide(item, guide)` and `seller_item_size_guide(item)`; `item_size_chart_payload` returns the item's own guide first (`{id: null, own: true}`), else the admin chart as before. Shared: `shared/src/options/sizeGuide.js` (table logic, shoe conversion, checks, payload), `ownSizeChart` and a `guide` input on `publicOptions`. Seller API: `getItemSizeGuide`, `saveItemSizeGuide` (live and mock); `duplicateItem` copies the guide.
- Why: size tables belong to the item and the seller who knows its measurements. Admin charts stay as templates sellers can copy, and as the fallback for items with no guide.
- Who must act: data/admin: run migration 0103 (supabase/catch-up-seller-size-guide.sql for a project that ran the catch-up). Buyer apps need nothing: `item.sizeChart` already carries columns and rows.

## 2026-11-12 G06 A17: 3D data, media roles and signed uploads (migration 0101)

- Contract: v1 (additive; nothing renamed or removed)
- Lane / author: G06 (A17)
- What changed:
  - `item_media` gains `role` (`image | video | spin-frame | model-glb | poster`) and `option_ids text[]` (option VALUE ids, plain ids, no foreign key; J01 adds the link). `kind` gains `model`, `spin`, `poster` (one kind per role), so every existing query that filters `kind = 'image'` or `'video'` is unchanged. Existing rows get `role = kind`. A 3D asset has no option id (the whole item) or exactly one; a photo or video may have several. A photo or video with no option id belongs to the whole item.
  - `public_items.media` now lists photos and videos only and every entry carries `id`, `role`, `optionIds` (only ids of values the item still has). The old keys `path`, `kind`, `duration` and the order are unchanged.
  - `items.has_3d` (column from 0096) is now kept by triggers on `item_media`: true when a visible view exists.
  - New public read `public_item_media3d(item uuid)`: `null` when the item is not public, else `{ view3d, view3dByOption }` made of PATHS: `view3d` = `{ model?: {path, size}, spin?: {frames: [path], count}, poster: path } | null`; `view3dByOption[valueId]` has the same shape for one option value. A view needs a poster AND (a model, or a spin of 12 to 72 frames); anything else is left out. `shared/src/media3d.js` `resolveMedia3d(payload, urlFor)` turns it into the Contract v1 `view3d` shape (`model.url`, `spin.frames` as urls, `poster` url). `view3dByOption` is the one addition to the item detail: the colour a buyer selects uses its own view when it has one, else `view3d`.
  - New API (names in the contract list kept): edge function `seller-media-ticket` is `seller_media_upload_ticket(kind)`; body `{ kind: image|video|model-glb|spin-frame|poster, itemId, type, size, optionIds? }`. Limits: `.glb` 15 MB, pictures 10 MB, video 25 MB, spin 72 frames per scope, 500 3D rows per item. Wrong type 422 `unsupported_type`, too large 413 `too_large`, full 409 `limit_reached`, too many unfinished tickets for one item (160) 429 `too_many_pending`. A model ticket returns `{ path, token, contentType: "model/gltf-binary" }` (upload with that content type); picture tickets return the Cloudinary fields as before. `seller-media3d-finalize` finishes a poster, spin frame or model (the role comes from the ticket; a `.glb` is read back and checked byte by byte; anything refused is deleted). New DB functions: `attach_item_media3d` (service only), `seller_set_media_options(item, media, optionIds)` (photos and videos only), `seller_item_media3d(item)` (the seller's read for B13 and B14), `item_check_media3d(item jsonb)` (issues: `view3d_missing_poster`, `spin_too_few_frames`, `spin_too_many_frames`; for `seller_check_item`, wired by J01).
  - `seller_item_media` lists photos and videos only (plus `role`, `optionIds`); `seller_reorder_item_media` and `seller_reorder_item_photos` ignore 3D rows.
  - Files: the `seller-media` bucket now allows `model/gltf-binary`; `media_register_upload`, the media tables' checks, the garbage-collection trigger and queue, and the orphan sweep know the purposes `item_model`, `item_poster`, `item_spin`. `mediaGc.ts` sends a `.glb` to the bucket, not to Cloudinary. `seller-item-copy-media` (Duplicate item) now also copies the model, poster and spin frames as new files (frames keep their order) and keeps every photo's, video's and 3D asset's option value ids.
- Why: B12 to B14 and C07 to C16 need media per option and a stored, validated 3D view.
- Who must act:
  - J01 (G03): call `item_check_media3d(item)` from `seller_check_item`; add the foreign key on option ids if wanted; make `item_options_apply` accept only photo/video ids as `mediaId` / `mediaIds`.
  - J02/J03 (client adapter): read `public_item_media3d` into `items.getDetail` (`view3d`, `view3dByOption`) with `resolveMedia3d`, and read `role` and `optionIds` from `media`.
- Request files: docs/requests/2026-11-12-g06-to-g03-check-media3d-and-media-ids.md, docs/requests/2026-11-12-g06-to-client-media3d-payload.md

## 2026-11-12 5.11: Admin spec rules editor (migration 0102)

- Contract: v1 (additive)
- Lane / author: Group 5, Prompt 5.11
- What changed:
  - `admin_spec_rows_list()` (reviewer, support, owner) returns `[{id, name, specRows}]` for active product types; `admin_save_spec_rows(p_id, p_rows)` (owner only) replaces one type's `specRows` and writes an audit row (`spec_rows.update`). Errors: `forbidden`, `type_not_found`, `invalid_spec_rows`, `too_many_required`.
  - SQL checks `spec_rows_valid` and `spec_condition_valid` mirror `checkSpecRows` and `checkCondition` in `shared/src/specRules`: slug keys, unique keys, level, input, label sets, choices, and conditions that point at another row of the same type.
  - Admin page `/admin/spec-rules` (nav "Spec rules", permissions `specrules.view` and `specrules.edit`): rows per type, level, input, label set or choices, "required when" and "shown only when" rules (one test, all or any), a four-required-row counter, and a preview of the seller form that evaluates the rules on sample answers.
- Not changed: the Product types page (Prompt 2.6) is not merged; the editor only changes `specRows`. Saving rules does not touch items that are already live; the gate applies when a seller next saves them.
- Who must act: Prompt 2.6 may link to `/admin/spec-rules` from its type editor.
- Request files: none

## 2026-11-13 1.11: size guides for drinks, bakery, wood, bags and shoes; lengths only convert (migration 0104)
- Contract: v1 (additive)
- Lane / author: seller + data
- What changed: seller guide kinds (shoe, clothing, bag, dimensions, drink, food) with their own starting tables; volume and weight read from size names ("750ml", "1kg"); a guide with no length column keeps `unit: null` (migration 0104, and `ownSizeChart`); `chartInUnit` and `canToggleUnit` now convert only length columns by header, so UK/US sizes, litres, grams, ages and counts are never converted (this also fixes admin shoe charts under the buyer's cm/inches switch).
- Why: a bottle of vodka, a loaf, a plank, a suitcase and a shoe are not sized the same way, and a numbers column is not always a length.
- Who must act: data: run supabase/catch-up-seller-size-guide.sql (0103 and 0104, safe to repeat).
- Request files: none

## 2026-11-13 1.12: size guide is easy to find; buyers always see the Size chart link
- Contract: v1 (additive, no migration)
- Lane / author: seller + client
- What changed: the seller "Size guide" step now also appears when the Specifications section has a Size row, and the Details step shows a "Does your item come in sizes?" card with an "Add a size guide" button for any item. An unknown item kind shows every kind's starting table up front. Buyers see a standalone "Size chart" link on items that have a guide but no size picker; the size axis detection no longer mistakes Volume/Weight amounts for colours.
- Who must act: none (redeploy the seller and client apps).
- Request files: none

## 2026-11-13 1.13: size guides for perfumes, paint, cement, nails, screws, bolts, wire, cable and tools
- Contract: v1 (additive, no migration)
- Lane / author: seller (shared)
- What changed: perfume, fragrance, cologne, parfum and deodorant names now get the drink (volume) table, with a new "Perfumes and sprays" table. A new "Hardware, paint and tools" kind (paint, cement, nails, screws, bolts, wire, cable, tools and similar names) with tables for paint and liquids, cement and bulk, fasteners, wire and cable, and tools. Hardware tables have no length columns, so buyers never see a cm/inch switch on them.
- Who must act: none (redeploy).
- Request files: none

## 2026-11-13 1.14: the item's product type is saved and read back; a failed later step no longer hides a saved item
- Contract: v1 (additive, no migration)
- Lane / author: seller
- What changed: `seller_save_item` already accepted `productTypeId` (0091) but the seller app never sent it, and the catalog read never returned it, so the type chosen in Add item / Edit item was lost after saving (the size guide kind, type-specific specification rows and the publish check all depend on it). `itemRow` now sends it (absent keeps it, null is "Other goods") and `catalogItem` returns `productTypeId`. If a step after the item is stored fails (size guide, brand link, media), the editor now says the item was saved and, for a new item, opens it for editing, so a retry no longer creates a duplicate.
- Who must act: none (redeploy the seller app).
- Request files: none

## 2026-11-13 1.15: save errors say what went wrong; the editor's re-reads after a save cannot fail it
- Contract: v1 (additive, no migration)
- Lane / author: seller
- What changed: `errorText` blamed "your connection" for every error it had no message for (a database function that is not installed yet, a product-type rule, an unmapped code). Now only a real network failure says that; a missing database update says so; any other unknown code is named. Messages added for `invalid_product_type`, `unknown_product_type`, `invalid_variants`, `invalid_price_tiers`, `tiers_need_from_price`, `invalid_unit`, `invalid_status`, `forbidden`; `type_not_allowed` in the item editor reads as a product-type refusal. After the item is stored, re-reading the options and the size guide to refresh the form can no longer turn a successful "Save and stay" into an error.
- Who must act: none (redeploy the seller app).
- Request files: none

## 2026-11-13 1.16: the editor sends the product type only when it changes
- Contract: v1 (additive, no migration)
- Lane / author: seller
- What changed: `seller_save_item` re-validates any `productTypeId` it receives (the type must be active and sellable by the shop). Since 1.14 the editor sent the stored type on every edit, so an item whose type was later switched off or restricted could not be saved at all. The editor now sends `productTypeId` only for a new item or when the seller changed it. Added `supabase/diagnose-item-save.sql` (read-only checks of the functions and columns saving needs) and `supabase/tests/seller-save-roundtrip.test.mjs`.
- Who must act: none for the app (redeploy the seller). Optional: run `supabase/diagnose-item-save.sql` in the SQL editor if saves still fail.
- Request files: none

## 2026-11-14 1.17: one catch-up script for a database that stopped part-way (saving items)
- Contract: v1 (no schema change)
- Lane / author: data
- What changed: added `supabase/catch-up-items.sql`, generated by `supabase/tools/build-catch-up.mjs`. It finds the first migration from 0038 on whose objects are missing and applies it and every later one in order, each in its own sub-transaction, then returns a table of what it applied. It does nothing on a current database. Tested against databases stopped after 0037, 0049, 0057, 0085, 0094 and 0099 and against a hand-patched 0085 + size-chart + size-guide catch-up state: every one ends with the same functions and columns as a fully migrated database, and saving and editing an item works. The seller app's "missing update" message now names the missing function.
- Who must act: run `supabase/catch-up-items.sql` once in the SQL editor (it is large; paste the whole file). Send back the result table if any row says SKIPPED.
- Request files: none

## 2026-11-14 1.18: catch-up-items.sql no longer reports 0086 as SKIPPED
- Contract: v1 (no schema change)
- Lane / author: data
- What changed: on a database that already had the size-chart catch-up, migration 0086 reported "SKIPPED: cannot drop columns from view" because the view `public_size_charts` already had its later (0093) columns. The generated script now drops that view before 0086 (0093 recreates it later in the same run), as `catch-up-size-charts.sql` already did. The earlier SKIPPED was harmless: the resulting functions and columns were identical to a full migration (tested).
- Who must act: nobody who already ran the first version; their database is correct. New runs show no SKIPPED row.
- Request files: none

## 2026-11-14 2.6: admin Product types page (migration 0108)

- Contract: v1 (additive)
- Lane / author: Group 2, Prompt 2.6
- What changed:
  - `admin_product_types_list()` (reviewer, support, owner) returns `{ types, departments, categories }`; `admin_save_product_type(p_id, p_type)` (owner only) creates or updates a type's name, department, categories, options (`axes`, at most 3, with suggested values) and `active` flag, and audits it as `product_type.create` or `product_type.update`.
  - `product_type_axes_valid` checks axis keys, labels, display kinds and suggested values.
  - Admin page `/admin/product-types` (permissions `producttypes.view`, `producttypes.edit`).
- Not changed: spec rows stay on `/admin/spec-rules`. Saving a type does not touch items that are already live.
- Who must act: nobody.
- Request files: none

## B13: scale data is stored, and the product list carries `sizeValues` (migration 0104)
- Migration `0104_option_scales_sizes.sql` (renumbered from 0094 and 0100, which main took): an option axis may carry `scale` (a scale id) and each value `stored`
  ({scale, system?, value, unit?, width?, shape?}), the two optional fields the buyer's scale labels already read (`client/src/lib/scaleLabels.js`). Validated, cleaned, shown by
  `item_option_axes_public`, kept by Duplicate, remap and photo delete. Also fixes `item_option_axes_drop_media`, which dropped `dependsOn`.
- `products_snapshot` carries `size_values` per item; `/api/products` returns it as `sizeValues` on each product (the field `sizeFilters.js` reads). `public_item_size_values(p_limit)`
  returns every live item's values at once for the two fallback paths (the endpoint's page-the-views, and the browser's `getAllProducts`). Closes
  `docs/requests/2026-11-07-sizes-to-client-list-size-values.md`.
- `/api/products` now reads `psize` and `prange` (same parameters as the page address) and includes them in the canonical query.
- Contract change for the Options step: the axis `scale` was form-only (`shared/src/options/editor.test.js` said so). It is now sent with the axis, and each value's `stored` (what
  `scales.parse` read) with the value, when `OPTION_SCALES_STORED` is true (default; false returns to form-only). `optionsFromServer` keeps both, so an edit does not lose them.
- Deploy order: apply migration 0104 before the seller app ships. If it is not applied yet, the editor retries a refused save once without scale data (`saveWithScaleFallback`),
  so a seller can still save; the scale data is simply not stored until the migration is in. Items saved before have no `stored`, so they have no Size facets until saved again.
- `npm run migration:renumber -- <file>.sql --next [--write]` renumbers a migration that is not applied anywhere. When another migration already has the old number it does
  not rewrite "migration NNNN" in words (it lists those places), so it cannot change another migration's text.
