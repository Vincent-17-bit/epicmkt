# Seller api: product types, type requests and productTypeId (answers lane B's 2026-11-05 request)

- From: a08 (lane A)      - To: seller (lane B / C)      - Date: 2026-11-06
- Status: open
- Contract: v1, "A08" in docs/contracts/CHANGES.md

## Answers to the open questions
- `restrictedTo[]` is **shop category ids**, compared with `business.categoryId` (`"chemist"`, `"agrovet"`). `canSell` in `AddItem.data.js` is right as written;
  `canSellType(type, categoryId)` in `@epicmkt/shared` is the same function.
- `seller_product_types` returns `{ departments: [{id, name}], types: [ProductType] }` (the shape the picker already accepts). Types the shop may not sell
  are already left out; keep your own `canSell` filter as a second line of defence.

## Need
1. `seller/src/api/live.js` (+ mock, contract): `sellerProductTypes()` -> rpc `seller_product_types`; `sellerRequestType(name, note)` -> rpc
   `seller_request_type` (`{p_name, p_note}`, returns the request id; asking twice for one name returns the same id).
2. Send `productTypeId` in the `saveItem` payload: a type id, `null` for Other goods, or leave the key out for items that never saw the picker.
   Errors to show in words: `type_not_allowed`, `unknown_product_type`, `invalid_product_type`, `too_many_type_requests` (requests), `invalid_name`, `invalid_note`.
   `seller_check_item` returns `type_not_allowed` as an issue code.
3. Validate the request form with `cleanTypeRequest(name, note)` from `@epicmkt/shared` (same limits as the database).

## Meanwhile
Keep the stand-ins behind `TODO(contract:A06)` until these wrappers exist.
