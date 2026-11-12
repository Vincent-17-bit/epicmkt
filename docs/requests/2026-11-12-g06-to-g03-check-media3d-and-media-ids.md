# Wire the 3D checks into seller_check_item and keep 3D rows out of option media ids (from A17 to G03)

- From: G06 / A17      - To: G03 (A04, J01)      - Date: 2026-11-12
- Status: open
- Contract: v1, 2026-11-12 G06 A17

## Need
1. `seller_check_item` should append the result of `item_check_media3d(item jsonb)` (migration 0101) to its issues. It returns a list of `{ code, scope }` with `scope` null for the whole item or the option value id. Codes: `view3d_missing_poster`, `spin_too_few_frames`, `spin_too_many_frames`.
2. `item_options_apply` (0086) accepts any `item_media` row of the item as a value's `mediaId` or a variant's `mediaIds`. It should accept only rows with `kind in ('image', 'video')`, so a swatch cannot point at a spin frame, a poster or a model.

## Why
1. Without it the seller editor only learns about a missing poster from `seller_item_media3d`; the buyer simply sees no 3D view.
2. Today the public payload hides 3D rows, so such a mediaId resolves to nothing and the swatch falls back to its colour. Nothing breaks, but the data is wrong.

## Suggested change
In `seller_check_item`: `issues := issues || public.item_check_media3d(item)` (the function needs `item ->> 'id'`). In `item_options_apply`, add `and im.kind in ('image', 'video')` to the two `exists (select 1 from public.item_media im ...)` checks.

## Meanwhile
Nothing is blocked. `item_check_media3d` and `seller_item_media3d` are usable directly.
