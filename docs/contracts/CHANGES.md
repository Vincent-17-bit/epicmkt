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
