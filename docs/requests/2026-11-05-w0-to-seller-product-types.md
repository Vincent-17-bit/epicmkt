# Expose the seller_product_types mock on the seller API

- From: w0      - To: seller (Lane C)      - Date: 2026-11-05
- Status: open
- Contract: v1, "W0" in docs/contracts/CHANGES.md

## Need
Add a `getProductTypes` call to the seller API contract and its mock (`seller/src/api/contract.js`, `seller/src/api/mock.js`) that returns
what the mock backend's `getSellerProductTypes()` returns: the list of `ProductType` (13 rows, see `shared/src/contracts/productTypes.js`).
The live adapter (`seller/src/api/live.js`) will call the RPC `seller_product_types` once Lane A ships it.

## Why
The item form needs the product types (and the axes each asks for) to offer a type picker. Without the call, Lane C has to import the
constant from `@epicmkt/shared` directly, which the live API will not allow.

## Suggested change
In the mock: `getProductTypes: () => backend.getSellerProductTypes()`. In the contract: document it as
`getProductTypes(): Promise<ProductType[]>`. Validate rows with `isProductType` from `@epicmkt/shared`.

## Meanwhile
Read `PRODUCT_TYPES` from `@epicmkt/shared` behind one helper and mark it `// TODO(contract:W0)`.
