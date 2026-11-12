# Read the 3D view and per-option media into the item detail (from A17 to client)

- From: G06 / A17      - To: client (J02/J03 adapter)      - Date: 2026-11-12
- Status: open
- Contract: v1, 2026-11-12 G06 A17

## Need
In the live adapter that builds `items.getDetail`: call `public_item_media3d(item)` and pass the result through `resolveMedia3d(payload, urlFor)` from `shared/src/media3d.js`. Put `view3d` on the detail and `view3dByOption` beside it. `urlFor(path, role)`: `model-glb` is a file in the Supabase bucket (`/storage/v1/object/public/seller-media/<path>`), `poster` and `spin-frame` are Cloudinary ids (`imageUrl`). Also keep `role`, `optionIds` and `id` on every `media[]` entry (`public_items.media` has them now). `has_3d` on the list payload is live.

## Why
C07 and C14 to C16 read `view3d` and `media[].optionIds`; the fixtures and the mock API have no such data until the adapter fills it.

## Meanwhile
C-lane prompts use a fixture plus `// TODO(contract:A17)`.
