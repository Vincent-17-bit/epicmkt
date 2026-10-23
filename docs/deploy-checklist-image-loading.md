## Deploy Checklist: Image placeholders, lazy loading and media caching
**Date:** 2026-10-23 | **Deployer:** ______ | **Apps touched:** client (customer site and PWA), ui (shared components)

No database migration. Product and flash-sale data still comes from `public_items` / `public_flash_sales`, which hold only
file paths; the files live in the `seller-media` bucket. Nothing new is stored in the database.

### Pre-Deploy
- [ ] `npm run test:ui`, `npm run test:client` and `npm run test:seller-ui` pass in CI (seller reuses the shared cards)
- [ ] `npm run lint:ui` is clean
- [ ] `VITE_ALLOW_MOCK_BUILD=true npm run build -w client` succeeds locally (placeholder is inlined in the CSS)
- [ ] Code reviewed and approved
- [ ] Decide on the optional flags (both default to off, so shipping without them is safe):
  - [ ] `VITE_IMAGE_TRANSFORMS=true` only if the Supabase project plan includes image transformations. Test one
        `/storage/v1/render/image/public/seller-media/<path>?width=480` url in a browser first
  - [ ] `VITE_MEDIA_HOSTS` only if every listed origin serves the bucket files at `<host>/<path>`. Open one picture on each
- [ ] Rollback plan: redeploy the previous Vercel deployment (no data or schema to undo)
- [ ] On-call team notified

### Deploy
- [ ] Deploy to a Vercel preview and open Home, a shop page, an item sheet and the flash sales page
- [ ] Throttle the network to "Slow 4G" in dev tools: each card shows the wavy EpicMKT placeholder, then fades in the picture, with no layout jump
- [ ] A card with no picture shows the still placeholder (no wave); a broken file URL keeps the placeholder and stops waving
- [ ] Turn on "reduce motion" in the OS: the wave and the fade stop
- [ ] Check dark mode: the wave is subtle, not a white flash
- [ ] Network tab: off-screen product pictures are not requested until you scroll near them; the first gallery picture loads straight away
- [ ] Network tab: `/assets/*` responses carry `Cache-Control: public, max-age=31536000, immutable`
- [ ] Reload the page: pictures come from the service worker cache (`media-images`), not the network
- [ ] Open a product sheet by its id/link and confirm its images and videos still load
- [ ] Promote to production, then monitor errors and latency for 15 minutes

### Post-Deploy
- [ ] Supabase dashboard: storage egress and request counts are flat or falling over the next 24 hours
- [ ] Vercel analytics: Largest Contentful Paint and Cumulative Layout Shift are the same or better on Home and shop pages
- [ ] Update release notes / changelog
- [ ] Close related tickets

### Rollback Triggers
- Pictures fail to load (placeholder never replaced) on more than a few percent of cards in a preview or production check
- Image requests return 4xx/5xx after turning on `VITE_IMAGE_TRANSFORMS` or `VITE_MEDIA_HOSTS`: unset the variable and redeploy first, only roll back if that does not fix it
- Cumulative Layout Shift gets worse than before the release
- Customer-facing pages error on load, or item sheets stop opening
