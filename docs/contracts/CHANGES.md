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
