# Request: split ItemView into slots

From: lane C (prompt C01, ItemDetail slots)
To: whoever owns `ui/src/item/**`
Date: 2026-11-05

## What C01 found

The brief described Gallery, Header, Options and Details as parts of `client/src/components/ItemDetail.jsx`. They are not. They
are drawn by `ItemView` in `ui/src/item/ItemView.jsx` (196 lines, exported from `@epicmkt/ui`). `ItemDetail.jsx` renders
`ItemView` once and fills its `flash`, `offers`, `seller` and `after` props.

C01 stayed inside its own paths. `ItemLayout.jsx` places the slots the client owns through those four props, and the
`Quantity` and `Delivery` placeholders go in the `offers` prop after `Offers` (they render nothing today).

## What is needed

So that later prompts can change Gallery, Header, Options or Details by editing one slot file, `ItemView` needs to either:

1. take slot props for them (for example `gallery`, `header`, `options`, `details`) and fall back to today's markup when a
   prop is not given, or
2. be split into exported components (`ItemGallery`, `ItemHeader`, `ItemOptions`, `ItemDetails`) that the client composes.

Either way the markup must stay identical for items with no product type and no options. `client/src/components/ItemDetail.dom.test.jsx`
compares the page with saved HTML and will catch a difference.

## Until then

Work that needs the variant picker (Options) has to go through `ItemView`'s existing `variants`, `activeId` and `onVariant`
handling, or wait for this change. Nothing in C01 depends on it.
