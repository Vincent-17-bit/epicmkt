# Buyer final QA (11.9)

Date: 2026-11-15. Build: client production build in mock mode (`VITE_ALLOW_MOCK_BUILD=true`), served with `vite preview`, driven by headless Chromium (Playwright) with axe-core 2 A/AA rules. Not run on a phone or in a headed browser.

## What passed

| Check | Result |
| --- | --- |
| axe (WCAG 2 A and AA) on home and six item pages across three sample shops (Swahili Plate Mombasa, Nyumbani Home Store, Golden Crust Bakery) | 0 violations |
| Width 360 and 1280: horizontal scroll on those pages | none |
| Page errors in the console during those visits | none |
| 3D library (`three`) | Not requested on any of those pages; it is a lazy chunk (688 kB, 177 kB gzip) loaded only when the model viewer opens. No `modulepreload` or static import from the entry chunk. |
| Item JSON-LD | Present on every item page checked |
| Unit tests | client 199 / 368 / 212 / 247 (shards), ui 186, shared 1390 |

Client entry chunk: 854 kB (285 kB gzip).

## Filed or changed in this pass

- **Price ranges had no structured data.** An item whose options are priced differently emitted one `Offer` with one price. It now emits an `AggregateOffer` with `lowPrice` and `highPrice` (tests in `itemView.test.js`). A flat range stays a plain `Offer`.

## Not checked (be honest about it)

- Real phone, real network speed, Safari and Firefox. Only headless Chromium was used.
- Item pages with options and tiers were checked by unit and component tests (axe included), not in the browser, because the mock catalogue has no such item among the first links the home page shows.
- Keyboard and screen-reader walkthrough by a person.
- Live data. Seeds are not loaded into any real database; run `npm run seed:types` against it first.
