# Request: seller api wrappers and save payload for product types

From: lane B (prompt B02, "What are you adding?" picker)
To: lane A (A06 and A08 owners: `supabase/functions/**`, `shared/src/**`, `backend/src/**`, `seller/src/api/**`)
Date: 2026-11-05

## What B02 found

`docs/contracts/` and `shared/src/contracts/fixtures` do not exist yet, and A06 and A08 are not merged, so B02 codes against
Contract v1 as given in the prompt, with stand-ins marked `TODO(contract:A06)` and `TODO(contract:A08)`.

## What is needed

1. **Seller api wrappers** in `seller/src/api/` (`live.js`, `mock.js`, `index.js`, `contract.js` `SELLER_API`):
   - `sellerProductTypes()` calling `seller_product_types`. The picker accepts either `ProductType[]` or `{ types, departments }`
     (`departments` is `{ id, name }[]`; types carry `departmentId`). Types a shop may not sell must already be left out.
   - `sellerRequestType(name, note)` calling `seller_request_type`.
   The picker (`seller/src/pages/business/catalog/AddItem.data.js`) uses these as soon as they exist. Until then it uses fixtures in
   local dev and tests only, and "Add item" keeps opening the editor directly (`productTypesReady()` is false).
2. **`restrictedTo[]` values.** B02 assumes they are shop category ids (`"chemist"`, `"agrovet"`), compared with `business.categoryId`.
   If A08 stores something else (a role, a flag on the shop), please say so and B02 will change one function (`canSell`).
3. **`seller_save_item` and shared.** `validateItemForm` (`shared/src/seller/itemForm.js`) returns an explicit object, so it drops
   `productTypeId`. B02 adds it to the `api.saveItem` payload in `ItemEditor.jsx` only when the seller used the picker (`null` means
   Other goods; items that never saw the picker send nothing new). Please:
   - accept `productTypeId` (nullable) in `seller_save_item` and the mock/live `saveItem`;
   - include it in `formFromItem` and `validateItemForm` so the editor, the draft and the payload agree, after which B02 deletes its
     two stand-in lines (search `TODO(contract:A06)` in `ItemEditor.jsx`).
4. **Item list rows** should carry `productTypeId` (Contract v1 already says so). The picker's "recent types" chips read it from `getCatalog` items.

## Update after rebasing on W0 (`533017f`)

Contract v1 as merged (`shared/src/contracts/types.js`, `productTypes.js`, `docs/contracts/v1.md`) is narrower than the text B02 was given:
a `ProductType` there is `{ id, name, group, priceType, unit, axes, variantFields, itemFields }` (13 types, ids such as `phone`, `shoes-eu`).
It has no `departmentId`, `categoryIds`, `restrictedTo`, `kind`, `quantityMode` or `slug`, and there is no departments list or
`seller_request_type` yet. `getSellerProductTypes()` exists in the mock backend only.

B02 therefore still runs on its own stand-ins (`AddItem.fixtures.js`, shaped like the prompt's Contract v1) and stays off by default:
"Add item" opens the editor as before until a seller api wrapper for `seller_product_types` exists.

Please say which shape is the truth for A06 and A08:
- departments as data (`departmentId` on a type, a departments list) and `restrictedTo[]`, as the B02 and A08 prompts describe; or
- the merged `group` shape, in which case A08 must add departments and restrictions to it.

Either way B02 changes in one place (`AddItem.data.js` normalises the response); the picker UI does not change.
