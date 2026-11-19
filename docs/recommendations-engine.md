# Recommendations engine: audit, fixes and what to do next

Covers the two product-page rows: **Goes well with this** (`shared/src/related/*`) and **Similar items** (`shared/src/similar*.js`).

## 1. How it was tested

The catalogue was read from the seeds in `scripts/seeds`: all **242 product types** across every department, and **1,054 realistic items** (every suggested value of each type's "what is it" axis, plus real Kenyan names added for the types that have none: *Beef pilau, Tecno Spark 20, Kentank 1000L, Dairy meal 70kg, Boxer 150 motorbike, Bridal makeup, Wiper blades pair...*). 339 of those are services. Every item was run through both engines, by name only, because most live items carry no product type today.

| Measure (name only, 1,054 items) | Before | After |
|---|---|---|
| Goods that get at least one "Goes well with" partner (name + type) | 33% | **84%** |
| Goods product types that have at least one partner group | 51% | **78%** (the rest are recorded in `NO_PARTNERS` with a reason) |
| Product types with an explicit decision (partners, or a recorded reason none) | not tracked | **100%**, enforced by a test |
| Names whose "Similar" head word the vocabulary knows | 22% | **55%** (77% for goods) |
| Worst case: every product in one shared section, share of different-type pairs that qualify as Similar | **61%** | **2%** |
| Same product type, sellers name sections differently, share judged Similar | 32% | **65%** (the rest are deliberately different kinds: shoe vs sandal, pilau vs curry) |

Your two reported bugs: on the current `main` the exact strings were already patched (screen protector under a phone case, jug under a gas cylinder), but the *same bug class* was wide open: "iPhone 13 case" still showed "Glass protector", and any two unrecognised words sharing a section qualified. That was the real defect.

## 2. Root causes found

1. **Similar: a shared section was proof.** The vocabulary knew 154 words, so 78% of names were "opaque" and an opaque pair qualified on a shared section alone. Sellers name sections loosely ("Cases and protectors", "Accessories"), so 336,689 of the 551,787 different-type pairs qualified (326,816 of them through this opaque path).
2. **Similar: product type was never used.** `productType` was accepted by the ranker but never passed in, so model names (Galaxy, Spark, Flip, Latitude) could not be recognised.
3. **Similar: compounds ignored plurals, model numbers and trailing brands.** "Tea bags" was a bag, "iPhone 13 case" was a bare "case", "Phone cover Samsung A15" was a "samsung".
4. **Goods with no partner decision.** Only 51% of goods types had any partner group, and nothing recorded whether the rest were intentional, so "nothing shows" could be an accident. 172 names classified differently from their own product type.
5. **Goes well with: word collisions.** "Fan belt", "tea bags", "dairy meal", "body butter", "TV unit", "chain and sprocket", "Dining chairs set" all land in the wrong group because they contain another product's word.

## 3. What changed

**`shared/src/related/data/complementMap.js`, `complements.js`**
- Groups and partners now cover every department: phones and computers, TV/audio, solar, lighting, fashion and beauty, baby, furniture, stationery and books, hardware, plumbing, electrical, auto and motorbike, farm, poultry, pets, food and drink.
- **Guards first** in `PHRASES`: names containing another product's word are listed before the product (a "phone case" is a case, a "laptop charger" is not a phone charger, "false nails" are not nails).
- **Locked groups** (`LOCKED_GROUPS`): when an item has a product type in a locked group (services, medicine, school uniform, pet accessories, raw food...), the type beats the words in the name, so a typed "Sofa cleaning" can never be a sofa.
- **Device + accessory rule**: "iPhone 13 case", "Samsung A15 screen guard", "Tecno charger" are accessories, not the device.
- **`NO_PARTNERS`**: every group that deliberately has nothing that goes with it records why (services, accommodation, property, medicine, alcohol, staples...). Medicine, alcohol, health products, services and places are never suggested for anything.
- Plural tolerance in the matcher ("fridges", "doughnuts").

**`shared/src/similar.js`, `similarVocab.js`**
- Vocabulary grown from 154 to 472 known words (394 nouns), plus phone brands and model lines as phones, laptop and tablet lines, earphone/headphone, printer, soda and beer brands, paint/emulsion, tank/Kentank.
- **Two different unreadable names now need a second signal** (a shared word, or the same product type) beyond the section. A nameless item ("Item") still qualifies on a section, as before.
- **Product type is evidence**: the same type joins names the vocabulary cannot read; two different types cancel a shared section.
- Compounds are matched on singulars and after model numbers are removed; a trailing device brand describes what it fits, not what it is.
- Headings never name a model or a stand-in phrase ("Other stores selling phone", not "...tecno spark").

**`client/src/api/flash/live.js`**: passes `product_type_id` for the item and, in one extra primary-key read run in parallel with the store read, for the candidates. If that read fails the ranking falls back to names and sections (tested).

**Guards that keep it right as the catalogue grows**
- `scripts/recommendation-coverage.test.mjs`: **adding a product type without deciding what goes with it fails the build.** Also checks every phrase classifies to its own group, every partner is reachable, weights are 1-10, nothing is offered with a service/medicine/alcohol.
- `scripts/recommendation-gaps.mjs`: feed it real item names; it prints the most common names the engines cannot read.

## 4. Recommendations, in order of value

### R1. Make product type a required field when a seller lists (highest impact)
Everything above is a fallback for items with no type. A typed item is classified exactly. Today most live items have none.
- **Seller UI:** make the product type picker the first step of "add item" (search-as-you-type over the 242 types), pre-filled from the name using `complementGroupOf` / `analyseName` as a suggestion the seller confirms.
- **Backfill:** run `scripts/recommendation-gaps.mjs` on live names, add the top phrases, then write a one-off script that sets `product_type_id` where a name maps to exactly one type, and flags the rest for an admin queue.

### R2. Ship the full type registry (with department and kind) to `shared`
`productTypeById` knows only 14 types. With all 242 (generated from `scripts/seeds` at build time, never hand-copied) the ranker can:
- veto a "same word" match across different **departments** (a laundry "Shirt" is not a "Shirt" for sale; "Cream" in dairy is not face cream): the 466 remaining name-only cross-type "same" pairs;
- know a type's **kind** (service vs good) and never mix them.

### R3. Return the product type from the database and search by it (migration 0140, not written here)
Right now Similar finds candidates by *name words and section*, so a typed "Omega 9" phone is never fetched for a "Zuri 5" phone. Add to `similar_item_candidates`: `product_type_id` in the returned JSON and a third pool CTE `typed` (same `product_type_id`, other stores, newest first, limit 300) unioned into `pool`. Needs an index `items (product_type_id, created_at desc) where visible and not draft`. Create it with `CREATE INDEX CONCURRENTLY` in its **own** migration, as the repo's other index migrations do. Then drop the extra read in `live.js`. Test it in `supabase/tests` with the DB suite (`npm run test:db`); I could not run that here.

### R4. Learn the weights from behaviour
The 1-10 weights are judgement. Log impressions and clicks of each "Goes well with" card (`source_group`, `target_group`, `shown_at`, `clicked`), and review weekly: raise pairs with a high click rate, remove pairs shown 500+ times with none. This also tells you which of the 84% of covered products are actually *good* recommendations, which no offline test can.

### R5. Seed the Relations page
The admin "Relations" pairs (migration 0109) override everything. Seed the 30 most-viewed products by hand (a regulator with the cylinder, a mattress with the bed). It costs an hour and fixes the front page of the site.

### R6. Run the gap report every week
`psql -At -c "select name from public_items" | node scripts/recommendation-gaps.mjs`. Add the top 20 unread names to `PHRASES` / `NOUNS`. The coverage test will tell you if an addition shadows something.

### R7. Known, deliberate limits (not bugs)
- Shoe vs sandal, speaker vs soundbar, table vs desk are "related", shown only when the seller put them in the same section.
- Names with no head noun at all ("Item", "32 GB") qualify on a shared section, as the original design intended; typing them (R1) removes the issue.
- Different dishes (pilau, curry) are different kinds.

## 5. Working rules for editing the vocabulary
1. A phrase that contains another product's word goes **above** that product in `PHRASES`. The coverage test names any phrase hidden behind an earlier one.
2. New nouns are written singular; `ie` words fold to `y` (`cooky`, `smoothy`), the vocabulary test enforces it.
3. A phrase that is an ordinary word under another name (`tecno spark` = phone) goes in `ALIAS_PHRASES`; a genuinely joined name (`tea bag`, `phone case`) goes in `COMPOUNDS`. Only the latter decides how a kind is said in a heading.
4. If a group should have nothing that goes with it, add it to `NO_PARTNERS` **with the reason**.

## 6. Verified
`npm run test:shared`: 1,486 passing. Client: 1,154 passing; the 5 `ItemDetail.dom` failures are identical on the untouched code and unrelated. The extra live test fails when the type-read protection is removed (checked). Not run here: the database suite (`test:db`), the UI/visual suites.
