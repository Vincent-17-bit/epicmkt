# Seller final QA (11.8)

Date: 2026-11-15. Build: seller production build in mock mode, plus the component test suite. The editor was **not** driven in a real browser: it needs a signed-in seller and no scripted login exists yet.

## What passed

| Check | Result |
| --- | --- |
| axe in component tests: 3D section, colour values, scale values editor, measurement editors, Options step | 0 violations |
| Unit and component tests | seller 252 / 244 / 189 / 187 (shards), shared 1390, DB 923 |
| Seeded types (A24 to A28) | Each validates (`validateProductType`), each opens in the editor and drives axes and publish checks (`seededTypes.test.jsx`). Phone fixture built through the real Options step matches the contract fixture. |

Seller entry chunk: 1,715 kB (530 gzip). Three, jsPDF, html2canvas and the map are separate lazy chunks.

## Not done

- **Editor bundle within 10 percent of before the lanes:** no baseline build was recorded before the lanes started, so there is nothing to compare with. From here on, 1,715 kB / 530 kB gzip is the number to hold.
- **360 px pass over the editor, real-browser axe, phone check:** not done (see above). Needs a scripted seller sign-in, or a person with a phone.
- Known gaps, none filed as blockers: a custom size is not stored by the database (`CUSTOM_SIZE_STORED` is off); road distance is an estimate (straight line x 1.3) until `VITE_ROUTING_URL` is set; nothing was checked on a phone or in a headed or non-Chromium browser.
