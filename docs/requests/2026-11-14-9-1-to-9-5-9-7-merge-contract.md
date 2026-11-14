# 9.1 to 9.5 and 9.7: merge contract

- `seller_similar_item_groups()` -> `[{key, name, brand, productTypeId, items: [{id, name, price, salePrice, stock, varies, visible, draft}]}]`. `varies` is the text removed from the name ("400g"); parse it with the scales.
- `seller_merge_items(ids, plan)` -> `{itemId, mergeId, expiresAt, published}`. Errors: `invalid_merge`, `invalid_name`, `invalid_options`, `invalid_choice`, `duplicate_variant`, `item_not_found`, `already_merged`, `item_in_flash_sale`, `has_options`, `needs_price`, `publish_blocked`.
- `seller_undo_merge(mergeId)` -> `{mergeId, restored}`. Errors: `merge_not_found`, `already_undone`, `undo_window_closed`.
- `public_item_redirect(oldId)` -> `{itemId, choice}` or null; preselect `choice` on the combined item.
- Merged sources stay in `items` hidden (`visible = false`); the seller list (9.5) should hide ids that have a redirect.
