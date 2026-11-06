# A18 to the owner of `scripts/sync-shared.mjs`: copy `openValues.js` to the edge functions when one needs it

No edge function uses the open values dictionary today (everything is in migration 0089), so nothing is blocked.

If one does later, add `["openValues.js", "openValues.js"]` to the `files` list in `scripts/sync-shared.mjs` and run `npm run sync:shared`.
`openValues.js` has no imports, so it copies as it is. The SQL function `normalize_value_key` and `normalizeValueKey` must keep giving the same key:
`supabase/tests/open-values.test.mjs` checks both against one table (`KEY_CASES`).
