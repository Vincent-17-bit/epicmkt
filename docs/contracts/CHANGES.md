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

## 2026-11-12 5.4: Publish gate on the server (migration 0099)

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

## B09: admin size charts and shoe conversion pages (1.9)
- Admin page `/admin/size-charts` (`admin/src/pages/catalogue/SizeChartsPage.jsx`): list, create, edit and delete size charts; one editable shoe conversion table;
  a live preview of what the buyer sees. Uses `admin_size_charts_list`, `admin_save_size_chart`, `admin_delete_size_chart`, `public_shoe_conversion`,
  `admin_save_shoe_conversion` (migration 0093). Validation is `cleanSizeChart` and `cleanShoeConversion`, the same as the database.
- Permissions (append-only): `sizes.view` (any admin), `sizes.edit` (owner only, mirrors the database). Nav: Catalogue > Size charts.
- Closes `docs/requests/2026-11-06-a05-to-admin-size-chart-and-shoe-conversion-pages.md`.
- Assumption: the product type picker is a text field of type ids (there is no admin product type list yet; A08 owns it). Swap it for a picker when one exists.

## B07 + B08 + B04/B05: scale-aware labels, size filters, seller value editors (1.7, 1.8, 1.4, 1.5)
- `publicOptions` passes an axis's `scale` (a scale id) and a value's `scaleValue` (its stored scale value) through to buyers when a seller's axis has them.
  Axes without them are unchanged. The buyer page shows values with `format` (shoes in the buyer's system, 1024 GB as 1 TB, "3-seater", dimensions per option).
  Nothing writes `scale` or `scaleValue` onto an axis yet: the seller save path (`seller_save_item`, A06) must keep them. Until then labels are parsed from the typed label.
- Shared: `scales.dimensionLabels`, `scales.dimensionProfileId`, `scales.DIMENSION_PROFILES` exported from `scales/index.js`; `shoeSummary(value, chart?)` in `sizeCharts.js`.
- Client: `lib/scaleLabels.js` (shoe system remembered in localStorage key `epicmkt.shoeSystem`), `lib/sizeFilters.js`. Filters add `psize` (canonical keys) and
  `prange` (`length:5-10`, `screen-inch:32-55`) to the page address; `facetsSummary`/`countsSummary` gain `sizes`.
- Contract needed from A06 (marked `TODO(contract:A06)`): the product list carries `sizes`, an array of stored scale values per product. Without it there are no size facets.
- Seller: `components/values` gains `ValueEditor` (router), `ScaleValueEditor`, `ShoeValueEditor`, `DimensionsEditor`, `ValueChips`, model in `scaleEditing.js`.
- Assumption: the editors merge 5 m with 500 cm and 1 TB with 1024 GB (by base amount); EU 42 and UK 8 stay as two entries because the seller typed two.

## B12: scale data is stored and the product list carries sizes (migration 0100)
- Migration `0100_option_scales_sizes.sql`: an option axis may carry `scale` (a scale id) and each value `scaleValue` ({scale, system?, value, unit?, width?, shape?}).
  Validated, cleaned, shown by `item_option_axes_public`, kept by Duplicate, remap and photo delete. Also fixes `item_option_axes_drop_media`, which dropped `dependsOn`.
  `products_snapshot` carries `sizes` per item (`item_sizes_public`); `public_item_sizes()` returns them for every live item at once (the page-the-views fallback).
- Contract change for B07 (the Options step): the axis `scale` was form-only ("the scale is form-only" in `shared/src/options/editor.test.js`). It is now sent with the
  axis, and each value's `scaleValue` (what `scales.parse` read) with the value, when `OPTION_SCALES_STORED` is true (default). Set it to false to go back to form-only.
  `optionsFromServer` keeps both, so an edit does not lose them. Axes without a scale and values typed on them send nothing new.
- Deploy order: apply migration 0100 before the seller app ships. If it is not applied yet, the editor's save retries once without scale data when the database answers
  `invalid_options` (`saveWithScaleFallback`), so a seller can still save; the scale data is simply not stored until the migration is in.
- `/api/products` reads `size=<canonical keys>` and `range=<scale>:<min>-<max>`; facets and counts include `sizes`; `sizes` is not sent per product. Size filters use the
  canonical keys from `client/src/lib/sizeFilters.js` (shoe 42 EU = UK 8; 5 m = 500 cm).
- `npm run migration:renumber -- <file>.sql --next [--write]` renumbers a migration that is not applied anywhere. It fixes the file name and header; when another migration
  already has the old number it does NOT rewrite "migration NNNN" in words (it lists those places for review), so it cannot change another migration's mentions.
- Not in this change: a seller entry point on the Price step for items with no options (main's Options step shows for typed items and items that already have options).
