# Recommendations engine: what it does, what was fixed, what to do next

The two product-page rows: **Goes well with this** (`shared/src/related/*`) and **Similar items** (`shared/src/similar*.js`). Both are pure
JS in `shared`, used by the demo backend and the live adapter (`client/src/api/flash/live.js`), so they rank the same way everywhere.

## 1. How it was measured

The catalogue is read from `scripts/seeds`: all **242 product types**, and **1,054 realistic items** (every suggested value of each type's
"what is it" axis, plus real Kenyan names for types that have none: *Beef pilau, Tecno Spark 20, Kentank 1000L, Dairy meal 70kg, Boxer 150
motorbike, Bridal makeup...*). 339 of them are services. Each item was run through both engines.

Measured on `main` (after the owner's reconciliation, PR #226) and after this change:

| Measure | main | now |
|---|---|---|
| Items with at least one "Goes well with" partner group (name + product type) | 59% | **89%** |
| Goods with a partner group (name + type) | 71% | **96%** |
| Goods product types that reach a group with partners | 87% | **94%** (the rest are recorded as deliberate in `scripts/recommendation-coverage.test.mjs`) |
| Seeded product types that have no decision at all | 153 of 242 had no mapping | **0**, enforced by a test |
| Similar, worst case: every product in one shared section, different-type pairs that qualify | 2% | 2% (unchanged: #226 already closed the section hole) |
| Similar, same product type judged similar, **name only, no shared section** | 41% | **52%** (higher still when the type is passed, as the live adapter now does) |

These are offline numbers on a synthetic but broad catalogue. They say the engine reads the catalogue; only click-through data (R4) can say the
recommendations are *good*.

## 2. Bugs fixed here (each reproduced on `main` first, each has a test that fails without the fix)

**Similar**
1. A heading named a model, not the kind: "Tea" said *tea leaves*, "Samsung Galaxy A15" said *galaxy*, "Tecno Spark 20" said *spark*, "Gas refill" said *gas cylinder*. Phrases that are only another name for an existing word now live in `ALIAS_PHRASES` and never decide how a kind is said.
2. Plurals, model numbers and a trailing device brand hid accessories: "Phone cases" had head *case* and was unknown; "iPhone 13 case" and "Phone cover Samsung A15" did not match "Silicone phone case". Phrases are now matched on singular words after model numbers are dropped, a trailing device brand describes what a product fits, and a bare case/cover/protector next to a phone is a phone accessory.
3. The product type was never used. It is now evidence: the same type joins names the vocabulary cannot read; two different types cancel a match that rests on a section. The live adapter passes `product_type_id` for the item and, in one primary-key read in parallel with the store read, for the candidates; if that read fails it falls back to names and sections (tested).
4. Keys such as `constructor` or `toString` (a product type id or a word in a name) found `Object.prototype` members in `singular`, `complementGroupOf` and `complementsOf`. All are own-property lookups now.

**Goes well with**
5. 153 of 242 product types were mapped to nothing, so an item with an unusual name but a seller-chosen type had no row. Every type is now mapped (`TYPE_GROUPS`), or is on a short, reasoned list that has nothing on purpose (medicine, alcohol, paperwork, mobile money, professional services).
6. Words from another product won over what the seller said it was: "Brake pads" read as feminine care (*pads*), "Chain per metre" as jewellery, "Table cloths" as a table, "Liver function" as meat, "Phone holder" as a phone. Specific names are now read first, and `LOCKED_TYPES` (every service type, plus goods types whose names routinely hold another product's word) make the seller's type beat the name.
7. Day-old chicks were treated as poultry *equipment* (so they never showed feed); they are livestock.

## 3. Where things live

- `shared/src/similarVocab.js`: `NOUNS`, `SYNONYM_GROUPS`, `COMPOUNDS` (joined names), `ALIAS_PHRASES` (another name for a known word), `DEVICE_BRANDS`, `DEVICE_ACCESSORY_HEADS`.
- `shared/src/related/data/complementMap.js`: `PHRASES` (names -> group, first match wins), `TYPE_GROUPS` (type -> group), `LOCKED_TYPES` (type beats name), `COMPLEMENTS` (group -> partners with weight 1-10).
- `scripts/recommendation-coverage.test.mjs`: fails when a product type is added without a decision, when a mapping points at nothing, or when a known misleading name is misread.
- `scripts/recommendation-gaps.mjs`: feed it real names, it prints the most common ones the engines cannot read.

## 4. Editing rules

1. A phrase that contains another product's word goes **above** that product in `PHRASES`.
2. New nouns are singular; the vocabulary test enforces it.
3. A phrase that is another name for a known word (`tecno spark` = phone, `tea bags` = tea) goes in `ALIAS_PHRASES`; a genuinely joined name (`phone case`, `t shirt`) goes in `COMPOUNDS`. Only the latter decides how a kind is worded in a heading.
4. A new product type goes in `TYPE_GROUPS` (or is named the same as its group). If it should have no partners, add it to `NO_PARTNERS` in the coverage test **with the reason**. If its names often contain another product's word, add it to `LOCKED_TYPES`.

## 5. Recommendations, in order of value

**R1. Make the product type the first step of "add item"** (highest impact). A typed item is classified exactly; everything above is a fallback. Pre-fill it from the name with `complementGroupOf` / `analyseName` as a suggestion the seller confirms, and backfill live items with `scripts/recommendation-gaps.mjs` plus a one-off script that sets `product_type_id` where a name maps to exactly one type and queues the rest for an admin.

**R2. Return the product type from the database and search by it.** Similar finds candidates by name words and section, so a typed "Omega 9" phone is never fetched for a "Zuri 5" phone. In a **separate migration**, add `product_type_id` to the JSON `similar_item_candidates` returns, a `typed` pool (same type, other stores, newest first) and an index on `(product_type_id, created_at desc)` created `CONCURRENTLY`, then drop the extra read in `live.js`. Needs the DB suite (`npm run test:db`), which was not run here.

**R3. Ship the type registry (department and kind) to `shared`.** `productTypeById` knows 14 types. With all 242 the ranker can veto a "same word" match across departments (a laundry "Shirt" is not a shirt for sale): about 440 name-only cross-type pairs still qualify as the same kind in the audit.

**R4. Learn the weights from behaviour.** Log impressions and clicks per `source_group -> target_group`; raise pairs with a high click rate, retire pairs shown often and never clicked.

**R5. Seed the admin Relations page** (migration 0109) with the 30 most-viewed products; it overrides everything.

**R6. Run the gap report weekly** and add the top unread names.

**R7. Deliberate limits.** Shoe vs sandal, speaker vs soundbar, table vs desk are "related" and only shown in a shared section; different dishes (pilau, curry) are different kinds; a name with no head noun at all ("Item") still qualifies on a shared section.

## 6. Verified

`npm run test:shared`, the client suite (run from `client/`), `test:api`, lint, conformance, migrations and shared-sync checks: see the pull request for the exact results. Not run here: the database suite (`test:db`), edge-function tests, and the UI/visual suites.
