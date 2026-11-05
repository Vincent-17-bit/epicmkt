# Item detail slots

`ItemDetail.jsx` (in `client/src/components`) owns the data, the timers, the focus handling and the handlers. Everything that is
drawn lives here, one component per slot. `ItemLayout.jsx` is the layout file: it says where each slot goes.

## How a slot works

- A slot takes one prop, `ctx`, and reads what it needs from it. The fields are built in `ItemDetail.jsx` (search for
  `const ctx`). Adding a field there does not touch any other slot.
- A slot with nothing to show returns `null`, so an empty slot adds no markup.
- Slots import `../ItemDetail.module.css` for their styles (the file stays where it is).
- Each later prompt edits its own slot file only.

## Slot map

Top to bottom, as they appear. "In ItemView" means it is drawn by `ItemView` in `ui/src/item/ItemView.jsx` (package
`@epicmkt/ui`), which the client cannot split. See `docs/requests/2026-11-05-lane-c-to-ui-itemview-slots.md`.

| Slot | File | Shows | Returns null when |
| --- | --- | --- | --- |
| TopBar | `TopBar.jsx` | Breadcrumb trail; close button in the sheet layout | never |
| States | `States.jsx` | `LoadFailed`, `Gone`, `Loading` (the body when there is no item) | not used when an item is showing |
| FlashSticky | `FlashSticky.jsx` | Sticky sale price once the banner scrolls away | no flash, sale held after ending, or no price |
| Gallery | In ItemView | Photos and videos | |
| Header | In ItemView | Brand, title, short description, price, stock, pack size | |
| Flash | `Flash.jsx` | Flash banner and the "sale ended" notice; placed above the header | no flash sale |
| Options | In ItemView | Variant picker | no variants |
| Offers | `Offers.jsx` | Offers this item is in | no item or no offers |
| Quantity | `Quantity.jsx` | Placeholder, renders nothing yet | always, for now |
| Delivery | `Delivery.jsx` | Placeholder, renders nothing yet | always, for now |
| SoldFrom | `SoldFrom.jsx` | Seller card with visit, chat, call, share, report | no seller |
| Details | In ItemView | Highlights, description, specs | nothing to show |
| Recommend | `Recommend.jsx` | Similar items (last section); `StoreMore` is more from this store, shown after the description and in the loading and gone states | no item (`Recommend`) |
| StickyNav | `StickyNav.jsx` | Footer: chat and visit store | no item or no seller |

## Where the placeable slots sit

`ItemView` already accepts four slot props, and `ItemLayout` fills them:

| ItemView prop | Filled with |
| --- | --- |
| `flash` | `Flash` |
| `offers` | `Offers`, `Quantity`, `Delivery` (in that order, inside the info block after pack size) |
| `seller` | `SoldFrom` |
| `after` | `ctx.selective` (`StoreMore`) |

`FlashSticky` is rendered just before `ItemView`, and `Recommend` just after it. `TopBar` and `StickyNav` are drawn by
`ItemDetail.jsx` around the body.

## Tests

`slots.test.jsx` has a render test for each slot. `ItemDetail.dom.test.jsx` compares the whole page's markup with saved
HTML and must pass without changes after any slot edit that is meant to leave a screen unchanged.
