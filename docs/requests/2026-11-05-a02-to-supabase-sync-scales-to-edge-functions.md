# Sync `shared/src/scales/*` to the edge functions (only if the functions need it)

- From: lane a / A02      - To: supabase (owner of `scripts/sync-shared.mjs`)      - Date: 2026-11-05
- Status: open            (open | accepted | done | declined)

## Need

`scripts/sync-shared.mjs` copies a fixed list of files. `shared/src/scales/` is not on it, so `seller_save_item` / `seller_check_item` cannot import
the scales until it is. The scales are pure ESM with no browser or Node APIs.

## What to add

Every `.js` file in `shared/src/scales/` and `shared/src/scales/remaining/` (A03 asked for the same) that is not a `*.test.js` or `testkit.js`: `util.js`, `define.js`, `registry.js`, `measure.js`, `plausibility.js`,
`validate.js`, `shoeChart.js`, `index.js` and one file per scale. The folder is flat, but `synced/` is flat too, so a `scales/` subfolder there keeps the
relative imports working.

## Meanwhile

Nothing in Lane A depends on it yet. Marked `TODO(contract:A01)` where it will matter.
