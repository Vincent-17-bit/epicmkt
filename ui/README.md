# @epicmkt/ui

Presentational components, design tokens and base styles. React, Font Awesome and `@epicmkt/shared` (pure functions) are the only dependencies. No router, store, API, analytics or Supabase.

```js
import "@epicmkt/ui/tokens.css";
import "@epicmkt/ui/reset.css";
import { ProductCard, ShopCard, BusinessPage } from "@epicmkt/ui";
```

Contents: `Button`, `IconButton`, `Container`, `Img`, `Skeleton`, `Accordion`, `Toaster` (props: `toasts`, `onDismiss`), `Modal`, `BottomSheet`, `Lightbox`, `PromoChip`, `FeaturedBadge`, `VerifiedBadge`, `AvailabilityDot`, `DiscountChip`, `ProductCard`, `ProductGallery`, `ShopCard`, `BusinessPage` (composed of `BusinessHero`, `BusinessSection`, `ActionRow`, `Offers`, `Services`, `Photos`, `Details`, `Hours`, `HoursTable`, `Location`, `Follow`, `ShareQr`, `BottomBar`, plus `BusinessPageSkeleton`, `BusinessPageError`).

## Contract

- Data and callbacks come in as props. Copy that varies comes in as `labels`.
- Links: pass `href`, and optionally `renderLink({ href, className, children, ...rest })`. The default is a plain anchor.
- `mode="preview"` on `ProductCard`, `ShopCard` and `BusinessPage`: links lose their `href`, buttons are disabled, nothing navigates, calls back or tracks. The caller supplies any "Preview only" treatment.
- `overlay` and `quickActions` slots on `ProductCard`, `ShopCard` and `BusinessPage` render caller content (`data-slot="overlay"`, `data-slot="quick-actions"`). They stay interactive in preview mode. With neither slot the DOM is unchanged.

`container` on `BusinessPage` (an element or ref): the contact bar renders inside it so it sticks to that host, for example a device frame. Without it the bar behaves as before.

`npm run test:visual` builds the Business page from `origin/main` and from the working tree, screenshots both at 360, 768 and 1280px in light and dark, and fails on any pixel difference. It needs Chromium: `npx playwright install chromium`, or set `CHROMIUM_PATH`.

`npm run lint:ui` fails if anything in `ui/src` imports from an app, the router, a store, react-query or Supabase.
