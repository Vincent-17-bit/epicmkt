# Request: seller api wrappers for the open values dictionary

- From: lane B / B04      - To: a      - Date: 2026-11-06
- Status: open
- Contract: v1, A18 (`seller_option_values`, `seller_add_option_value`, `seller_link_item_values`)

## Need
Two wrappers in `seller/src/api/` (`live.js`, `mock.js`, `index.js`, and the `SELLER_API` list in `contract.js`), plus one for linking:

```js
// live.js
export const sellerOptionValues = (kind, query = "", limit = 8) => rpc("seller_option_values", { p_kind: kind, p_query: query, p_limit: limit });
export const sellerAddOptionValue = (kind, label, hex = null) => rpc("seller_add_option_value", { p_kind: kind, p_label: label, p_hex: hex });
export const sellerLinkItemValues = (itemId, values) => rpc("seller_link_item_values", { p_item_id: itemId, p_values: values });
```

`mock.js` should answer with the same shapes (`{ matches, canAdd, addLabel }`, `{ created, value }`); `createLocalSource` in
`seller/src/components/values/source.js` is a ready model that already follows the migration's rules using `shared/src/openValues.js`.

## Why
The B04 inputs (`OpenValueInput`, `ColorValueInput`) take a `source` and have no api to call yet. `useOpenValueSource()` switches to the real api
by itself the moment `api.sellerOptionValues` and `api.sellerAddOptionValue` exist. A production build without them gets `null`, and the inputs
say suggestions are unavailable, so nothing pretends to save a value.

`seller_link_item_values` matters for admin merge and rename: they reach only items that are linked (migration 0090 header: "the app calls
seller_link_item_values after a save"). Please also say whether A-lane wants the editor to call it after each `saveItem`, or whether
`seller_save_item` should link the values itself (a new migration), which would spare every editor step from remembering the extra call.

## Suggested change
As above. Errors already arrive as `ApiError` with the code first (`too_many_pending`, `invalid_label`, `label_too_long`, `invalid_hex`); the inputs
read `error.code` / `error.message`.

## Meanwhile
`createLocalSource` is used in local dev and tests only (`// TODO(contract:A18)` in `source.js` and `useOpenValueSource.js`).
