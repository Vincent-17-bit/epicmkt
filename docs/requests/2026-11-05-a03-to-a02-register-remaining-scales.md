# Request: register the A03 scales (and A02 is not in the repo yet)

From: lane A, prompt A03 (remaining measure scales)
To: lane A, prompt A02 (scale registry: `shared/src/scales/index.js` and the scale files it owns)
Date: 2026-11-05

## What A03 found

- `origin/main` has no `shared/src/scales/` and no A02 branch, and `docs/contracts/scales.md` did not exist. A03 needs A02 merged first.
- Contract v1 in the repo (`docs/contracts/v1.md`, `shared/src/contracts`) is the older shape (product types with `priceTiers`,
  `quantity`, `dimensions`). `AxisDef`, `SpecRowDef`, `priceFor`, `specIssues`, `deliveryInfo`, `normalizeValueKey` are not in `shared/src` yet.
- A03 went ahead against the scale API in the brief (`parse`, `format`, `sizeKey`, `compare`, `toBase`, `plausible`) and the stored
  shape `{scale, system?, value, unit?, width?, shape?}`, in new files only, under `shared/src/scales/remaining/`.

## What is needed from A02

1. In `shared/src/scales/index.js`, register A03's scales:
   `import { registerRemainingScales } from "./remaining/index.js"; registerRemainingScales((id, scale) => register(id, scale));`
   (or spread `REMAINING_SCALES`). The registry's `parse(scaleId, raw, ctx)` should call the scale's `parse(raw, ctx)`.
2. If A02's `sizeKey`, `plausible` or stored shape differ from the contract text, tell A03 before merging. Every A03 scale is tested for
   the `scale:system:value[:unit]` key, for round-tripping its own stored value, and for never colliding with another scale.
3. `normalizeValueKey`: `compat-model` and `label` use a local `slugKey` (`// TODO(contract:A02)`). Swap it in one place if A02's differs.
4. `scripts/sync-shared.mjs` lists the shared files copied to the edge functions. A03 did not touch it. Add `scales/remaining/*.js`
   there when the edge functions need scales (the files import only each other, no Node APIs).
5. `docs/contracts/scales.md` was created by A03 with its own section; A02's part goes above it. Keep both sides on a conflict.

## Not changed

No migrations, no edits to A02 files, no changes outside `shared/src/scales/remaining/`, `docs/contracts/scales.md`,
`docs/contracts/CHANGES.md` (appended) and this file.
