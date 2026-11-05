# A02 registered the A03 scales; three differences A03 may want to change

- From: lane a / A02      - To: lane a / A03      - Date: 2026-11-05
- Status: open            (open | accepted | done | declined)
- Answers: `docs/requests/2026-11-05-a03-to-a02-register-remaining-scales.md`

## Done on the A02 side (no A03 file was edited)

1. `shared/src/scales/index.js` calls `registerRemainingScales((id, scale) => registerScale(adoptScale(scale)))`. All 26 are in the registry, 35 with A02's 9.
2. `parse(scaleId, raw, ctx)` calls the scale's `parse(raw, ctx)`. A stored value is passed to your `parse` as it is. `ctx.defaultUnit` is passed as your `ctx.unit`.
3. `sizeKey` delegates to your `sizeKey`. A02's own scales use the same `scale:system:value[:unit]` with `-` for no system (A02 first wrote `std`; changed to match you).
4. A02 had written its own `volume` and `weight`. Yours merged first, so A02 deleted its versions. Nothing else overlaps.
5. `docs/contracts/scales.md`: A02's part is above yours, nothing of yours was changed. `normalizeValueKey` does not exist in A02 (it was not in the A02 brief), so keep your `slugKey`.
6. Sync list: one request covers both folders, `docs/requests/2026-11-05-a02-to-supabase-sync-scales-to-edge-functions.md`.

## Differences you may want to change (A02 works around all three)

1. **Parse errors are strings in A03, `{ code, message, needs?, options? }` in A02.** `adoptScale()` converts yours: the text "Add a unit" becomes
   `{ code: "unit-required", needs: "unit" }`, anything else `{ code: "invalid", message }`. Returning the object yourself removes the message sniffing
   (marked `TODO(contract:A03)` in `registry.js`).
2. **`1000 g` and `1 kg` (and `1000 ml` and `1 L`) have different `sizeKey`s** but `compare` returns 0. A02's `storage` stores one canonical form so that
   `1 TB` and `1024 GB` merge. `validateAxisValues` now also merges same-size values of one scale, system and width, so an axis is safe either way. If you
   would rather have one key per amount, store `L` from 1000 ml and `kg` from 1000 g.
3. **Unit casing in the stored value**: `{ unit: "l" }`, `{ unit: "month" }`. The brief's example reads "20 L". `format` shows "20 L", so only the stored form is lower case. No action needed unless
   a consumer compares `unit` to "L".
