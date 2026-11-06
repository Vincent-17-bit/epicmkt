# Admin: a page for missing-type requests

- From: a08 (lane A)      - To: admin      - Date: 2026-11-06
- Status: open
- Contract: v1, "A08" in docs/contracts/CHANGES.md

## Need
A list of sellers' requests for product types they could not find, with a resolve action. Append your own block to `navConfig.js` and `App.jsx`.
- List: rpc `admin_type_requests_list` with `{p_status}` = `pending` (default), `resolved`, `declined` or `all`. Rows:
  `{id, name, note, status, created_at, resolved_at, resolvedTypeId, adminNote, businessId, businessName, sellerId, categoryId, alsoAskedBy}`.
  `alsoAskedBy` is how many other shops have the same name pending: sort or badge by it.
- Resolve: rpc `admin_resolve_type_request` with `{p_id, p_outcome, p_type_id, p_note}`. `p_outcome` is `resolved` (optionally with the existing type that now
  covers it) or `declined` (a note is required; it is the reason the seller reads). Owner and reviewer roles only; other roles get `forbidden`.
  A request that is already closed gives `type_request_closed`.
- Only the type list that `seller_product_types` knows is available for `p_type_id` until A06 lands; an unknown id gives `unknown_product_type`.
